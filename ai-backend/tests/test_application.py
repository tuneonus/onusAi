"""Exercise the assembled application over a real loopback HTTP connection."""

import asyncio
import base64
import hashlib
import hmac
import http.client
import json
import logging
import os
import socket
import threading
import time
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import uvicorn
from fastapi import HTTPException

from app.core.config import Settings

TEST_INTERNAL_SECRET = "test-internal-auth-secret-at-least-32-characters"
FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "packages"
    / "ai-contract"
    / "respond-v1.fixture.json"
)
CONTRACT_FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

# Provide required startup settings only during module import if absent.
with patch.dict(
    os.environ,
    {
        "AI_INTERNAL_AUTH_SECRET": TEST_INTERNAL_SECRET,
        "AI_GENERATION_MODE": "mock",
    },
):
    from app.main import create_app


def sign_test_token(
    *,
    secret: str = TEST_INTERNAL_SECRET,
    issuer: str = "onusai-backend",
    audience: str = "onusai-ai-backend",
    subject: str = "service:backend",
    scope: str = "ai:health",
    issued_at: int | None = None,
    ttl_seconds: int = 60,
    delegation: dict[str, Any] | None = None,
) -> str:
    now = int(time.time()) if issued_at is None else issued_at
    header = {"alg": "HS256", "typ": "JWT"}
    payload: dict[str, Any] = {
        "iss": issuer,
        "aud": audience,
        "sub": subject,
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": "test-token-id-1",
        "scope": scope,
    }
    if delegation is not None:
        payload["delegation"] = delegation
    encode = lambda obj: base64.urlsafe_b64encode(
        json.dumps(obj, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=").decode("ascii")
    signing_input = f"{encode(header)}.{encode(payload)}"
    signature = base64.urlsafe_b64encode(
        hmac.new(
            secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256
        ).digest()
    ).rstrip(b"=").decode("ascii")
    return f"{signing_input}.{signature}"


def build_delegation_from_fixture() -> dict[str, Any]:
    req = CONTRACT_FIXTURE["request"]
    return {
        **req["scope"],
        "allowedTools": req["assistant"]["allowedTools"],
        "allowedKnowledgeScopes": req["assistant"]["allowedKnowledgeScopes"],
        "knowledgeLocationScope": req["assistant"]["knowledgeLocationScope"],
        "knowledgeLocationIds": req["assistant"]["knowledgeLocationIds"],
    }


def build_live_respond_payload(**overrides: Any) -> dict[str, Any]:
    payload = json.loads(json.dumps(CONTRACT_FIXTURE["request"]))
    payload["deadlineAtMs"] = int(time.time() * 1000) + 5000
    payload.update(overrides)
    return payload


class ApplicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        application = create_app(
            Settings(
                _env_file=None,
                app_name="Test AI Service",
                log_level="INFO",
                internal_auth_secret=TEST_INTERNAL_SECRET,
                internal_max_request_bytes=4096,
                internal_max_deadline_ms=10_000,
                generation_mode="mock",
            )
        )

        # Failure and slow async fixtures belong only to this test application.
        @application.get("/_tests/failure")
        async def simulate_failure() -> None:
            raise RuntimeError("Simulated internal failure")

        @application.get("/_tests/http-error")
        async def simulate_http_error() -> None:
            raise HTTPException(
                status_code=429,
                detail="Try again later.",
                headers={"Retry-After": "5"},
            )

        @application.get("/_tests/validation")
        async def validate_count(count: int) -> dict[str, int]:
            return {"count": count}

        @application.get("/_tests/slow-deadline")
        async def simulate_deadline() -> dict[str, str]:
            from app.core.async_boundary import run_with_deadline

            async def slow_task() -> str:
                await asyncio.sleep(1.0)
                return "done"

            return {"result": await run_with_deadline(slow_task(), 30)}

        listener = socket.socket()
        cls.addClassCleanup(listener.close)
        listener.bind(("127.0.0.1", 0))
        cls.port = listener.getsockname()[1]

        server_error_patch = patch.object(
            logging.getLogger("uvicorn.error"), "disabled", True
        )
        server_error_patch.start()
        cls.addClassCleanup(server_error_patch.stop)
        cls.server = uvicorn.Server(
            uvicorn.Config(
                application,
                loop="asyncio",
                lifespan="on",
                log_config=None,
                access_log=False,
            )
        )
        cls.server_thread = threading.Thread(
            target=cls.server.run, kwargs={"sockets": [listener]}, daemon=True
        )
        cls.addClassCleanup(cls.stop_server)
        cls.server_thread.start()

        deadline = time.monotonic() + 10
        while not cls.server.started:
            if not cls.server_thread.is_alive() or time.monotonic() >= deadline:
                raise RuntimeError("Test server did not start within 10 seconds")
            time.sleep(0.01)

    @classmethod
    def stop_server(cls) -> None:
        cls.server.should_exit = True
        cls.server_thread.join(timeout=5)
        if cls.server_thread.is_alive():
            raise RuntimeError("Test server did not shut down within 5 seconds")

    def request(
        self,
        path: str,
        method: str = "GET",
        headers: dict[str, str] | None = None,
        json_body: Any = None,
    ) -> tuple[int, dict[str, str], dict[str, Any]]:
        data = (
            json.dumps(json_body).encode("utf-8") if json_body is not None else None
        )
        req_headers = dict(headers or {})
        if data is not None:
            req_headers.setdefault("Content-Type", "application/json")
        request = Request(
            f"http://127.0.0.1:{self.port}{path}",
            method=method,
            headers=req_headers,
            data=data,
        )
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error

        with response:
            return (
                response.status,
                {name.lower(): value for name, value in response.headers.items()},
                json.load(response),
            )

    def test_health_and_correlation_ids(self) -> None:
        status_code, headers, body = self.request(
            "/api/v1/health", headers={"X-Request-Id": "req-corr-0001"}
        )

        self.assertEqual(status_code, 200)
        self.assertEqual(headers["content-type"], "application/json")
        self.assertEqual(headers["x-request-id"], "req-corr-0001")
        self.assertEqual(body, {"status": "ok"})

        _, invalid_headers, _ = self.request(
            "/api/v1/health", headers={"X-Request-Id": "bad id!"}
        )
        self.assertNotEqual(invalid_headers["x-request-id"], "bad id!")
        self.assertGreaterEqual(len(invalid_headers["x-request-id"]), 32)

    def test_internal_health_accepts_valid_signed_token(self) -> None:
        token = sign_test_token()
        status_code, headers, body = self.request(
            "/api/v1/internal/health",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(status_code, 200)
        self.assertEqual(headers["cache-control"], "no-store")
        self.assertEqual(body, {"status": "ok", "subject": "service:backend"})

    def test_internal_health_rejects_missing_forged_expired_and_wrong_scope_tokens(
        self,
    ) -> None:
        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            missing_status, missing_headers, missing_body = self.request(
                "/api/v1/internal/health"
            )
        self.assertEqual(missing_status, 401)
        self.assertEqual(missing_headers["www-authenticate"], "Bearer")
        self.assertEqual(
            missing_body, {"detail": "Internal service authentication required."}
        )

        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            forged_status, forged_headers, forged_body = self.request(
                "/api/v1/internal/health",
                headers={
                    "Authorization": f"Bearer {sign_test_token(secret='wrong-' + TEST_INTERNAL_SECRET)}"
                },
            )
        self.assertEqual(forged_status, 401)
        self.assertEqual(forged_headers["www-authenticate"], "Bearer")
        self.assertEqual(forged_body, {"detail": "Invalid internal service token."})

        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            expired_token = sign_test_token(
                issued_at=int(time.time()) - 120, ttl_seconds=60
            )
            expired_status, _, expired_body = self.request(
                "/api/v1/internal/health",
                headers={"Authorization": f"Bearer {expired_token}"},
            )
        self.assertEqual(expired_status, 401)
        self.assertEqual(
            expired_body, {"detail": "Internal service token has expired."}
        )

        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            wrong_scope_status, _, wrong_scope_body = self.request(
                "/api/v1/internal/health",
                headers={"Authorization": f"Bearer {sign_test_token(scope='ai:chat')}"},
            )
        self.assertEqual(wrong_scope_status, 403)
        self.assertEqual(
            wrong_scope_body, {"detail": "Insufficient internal service scope."}
        )

    def test_internal_respond_contract_and_correlation_propagation(self) -> None:
        payload = build_live_respond_payload()
        token = sign_test_token(
            scope="ai:respond", delegation=build_delegation_from_fixture()
        )
        status_code, headers, body = self.request(
            "/api/v1/internal/respond",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Request-Id": payload["requestId"],
            },
            json_body=payload,
        )

        self.assertEqual(status_code, 200)
        self.assertEqual(headers["cache-control"], "no-store")
        self.assertEqual(headers["x-request-id"], payload["requestId"])
        self.assertEqual(body["contractVersion"], "1.0")
        self.assertEqual(body["requestId"], payload["requestId"])
        self.assertEqual(body["mode"], "mock")
        self.assertEqual(body["model"], "mock")
        self.assertEqual(body["promptVersion"], "respond-v1")
        self.assertEqual(body["grounded"], False)
        self.assertEqual(body["status"], "completed")
        self.assertEqual(body["citations"], [])
        self.assertEqual(body["toolProposals"], [])

    def test_internal_respond_rejects_missing_or_forged_delegation_and_header_mismatch(
        self,
    ) -> None:
        payload = build_live_respond_payload()

        # Token with ai:respond scope but no delegation claims -> 403.
        no_delegation_token = sign_test_token(scope="ai:respond")
        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            status_code, _, body = self.request(
                "/api/v1/internal/respond",
                method="POST",
                headers={"Authorization": f"Bearer {no_delegation_token}"},
                json_body=payload,
            )
        self.assertEqual(status_code, 403)
        self.assertEqual(body, {"detail": "Scoped delegation claims are required."})

        # Forged tenant businessId in body compared to signed delegation -> 403.
        valid_token = sign_test_token(
            scope="ai:respond", delegation=build_delegation_from_fixture()
        )
        forged_payload = build_live_respond_payload()
        forged_payload["scope"]["businessId"] = "99999999-9999-4999-8999-999999999999"
        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            forged_status, _, forged_body = self.request(
                "/api/v1/internal/respond",
                method="POST",
                headers={"Authorization": f"Bearer {valid_token}"},
                json_body=forged_payload,
            )
        self.assertEqual(forged_status, 403)
        self.assertEqual(
            forged_body, {"detail": "Request context does not match signed delegation."}
        )

        # Header X-Request-Id mismatch with body requestId -> 400.
        mismatch_status, _, mismatch_body = self.request(
            "/api/v1/internal/respond",
            method="POST",
            headers={
                "Authorization": f"Bearer {valid_token}",
                "X-Request-Id": "req-different-id-1",
            },
            json_body=payload,
        )
        self.assertEqual(mismatch_status, 400)
        self.assertEqual(
            mismatch_body, {"detail": "Request ID mismatch between header and payload."}
        )

    def test_internal_respond_enforces_deadlines_schema_drift_and_body_size_limits(
        self,
    ) -> None:
        token = sign_test_token(
            scope="ai:respond", delegation=build_delegation_from_fixture()
        )

        # Already-expired deadline -> 504.
        expired_payload = build_live_respond_payload(
            deadlineAtMs=int(time.time() * 1000) - 10
        )
        expired_status, _, expired_body = self.request(
            "/api/v1/internal/respond",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            json_body=expired_payload,
        )
        self.assertEqual(expired_status, 504)
        self.assertEqual(expired_body, {"detail": "AI request deadline exceeded."})

        # Excessive deadline (> internal_max_deadline_ms) -> 422.
        far_payload = build_live_respond_payload(
            deadlineAtMs=int(time.time() * 1000) + 120_000
        )
        far_status, _, _ = self.request(
            "/api/v1/internal/respond",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            json_body=far_payload,
        )
        self.assertEqual(far_status, 422)

        # Schema drift (unexpected field) -> 422 without echoing submitted secret/value.
        drift_payload = build_live_respond_payload(unexpectedField="private-drift-val")
        drift_status, _, drift_body = self.request(
            "/api/v1/internal/respond",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            json_body=drift_payload,
        )
        self.assertEqual(drift_status, 422)
        self.assertNotIn("private-drift-val", json.dumps(drift_body))

        # Oversized payload via Content-Length -> 413 with X-Request-Id preserved.
        oversized_payload = build_live_respond_payload()
        oversized_payload["conversation"]["userMessage"] = "x" * 5000
        oversized_status, oversized_headers, oversized_body = self.request(
            "/api/v1/internal/respond",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Request-Id": "req-oversize-0001",
            },
            json_body=oversized_payload,
        )
        self.assertEqual(oversized_status, 413)
        self.assertEqual(oversized_headers["x-request-id"], "req-oversize-0001")
        self.assertEqual(
            oversized_body,
            {"detail": "Request payload exceeds maximum allowed size."},
        )

        # Chunked oversized payload without Content-Length -> 413.
        raw_oversized = json.dumps(oversized_payload).encode("utf-8")
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            conn.request(
                "POST",
                "/api/v1/internal/respond",
                body=iter([raw_oversized[:2048], raw_oversized[2048:]]),
                headers={
                    "Content-Type": "application/json",
                    "Transfer-Encoding": "chunked",
                    "Authorization": f"Bearer {token}",
                },
                encode_chunked=True,
            )
            chunked_resp = conn.getresponse()
            chunked_body = chunked_resp.read()
            self.assertEqual(chunked_resp.status, 413, chunked_body.decode("utf-8", "replace"))
        finally:
            conn.close()

        # Async deadline cancellation test fixture -> 504.
        slow_status, _, slow_body = self.request("/_tests/slow-deadline")
        self.assertEqual(slow_status, 504)
        self.assertEqual(slow_body, {"detail": "AI request deadline exceeded."})

    def test_missing_route(self) -> None:
        status_code, _, body = self.request("/api/v1/missing")

        self.assertEqual(status_code, 404)
        self.assertEqual(body, {"detail": "Not Found"})

    def test_unsupported_method_preserves_allow_header(self) -> None:
        status_code, headers, body = self.request("/api/v1/health", method="POST")

        self.assertEqual(status_code, 405)
        self.assertIn("GET", headers["allow"])
        self.assertEqual(body, {"detail": "Method Not Allowed"})

    def test_http_exception_preserves_status_and_headers(self) -> None:
        status_code, headers, body = self.request("/_tests/http-error")

        self.assertEqual(status_code, 429)
        self.assertEqual(headers["retry-after"], "5")
        self.assertEqual(body, {"detail": "Try again later."})

    def test_validation_response_does_not_echo_input(self) -> None:
        status_code, _, body = self.request("/_tests/validation?count=private-value")

        self.assertEqual(status_code, 422)
        self.assertEqual(body["detail"][0]["loc"], ["query", "count"])
        self.assertNotIn("private-value", json.dumps(body))
        self.assertNotIn("input", body["detail"][0])
        self.assertNotIn("ctx", body["detail"][0])

    def test_unexpected_error_is_safe_and_logged(self) -> None:
        with self.assertLogs("app.core.exceptions", level="ERROR") as captured:
            status_code, headers, body = self.request(
                "/_tests/failure", headers={"X-Request-Id": "req-err-0001"}
            )

        self.assertEqual(status_code, 500)
        self.assertEqual(headers["x-request-id"], "req-err-0001")
        self.assertEqual(body, {"detail": "Internal server error."})
        log_output = " ".join(captured.output)
        self.assertIn("RuntimeError", log_output)
        self.assertIn("req-err-0001", log_output)
        self.assertNotIn("Simulated internal failure", json.dumps(body))
        self.assertNotIn("Simulated internal failure", log_output)

    def test_openapi_includes_versioned_health_and_internal_routes(self) -> None:
        status_code, _, schema = self.request("/openapi.json")

        self.assertEqual(status_code, 200)
        self.assertEqual(schema["info"]["title"], "Test AI Service")
        self.assertIn("get", schema["paths"]["/api/v1/health"])
        self.assertIn("get", schema["paths"]["/api/v1/internal/health"])
        self.assertIn("post", schema["paths"]["/api/v1/internal/respond"])


class LifespanTests(unittest.IsolatedAsyncioTestCase):
    def make_settings(self, log_level: str = "INFO") -> Settings:
        return Settings(
            _env_file=None,
            log_level=log_level,  # type: ignore[arg-type]
            internal_auth_secret=TEST_INTERNAL_SECRET,
            generation_mode="mock",
        )

    async def test_startup_and_shutdown_are_logged(self) -> None:
        application = create_app(self.make_settings("INFO"))

        with self.assertLogs("app.main", level="INFO") as captured:
            async with application.router.lifespan_context(application):
                self.assertIn("Starting", captured.output[0])

        self.assertIn("Stopped", captured.output[-1])

    async def test_shutdown_is_logged_after_failure(self) -> None:
        application = create_app(self.make_settings("INFO"))

        with self.assertLogs("app.main", level="INFO") as captured:
            with self.assertRaises(RuntimeError):
                async with application.router.lifespan_context(application):
                    raise RuntimeError("Simulated lifespan failure")

        self.assertIn("Stopped", captured.output[-1])

    async def test_logging_uses_configured_level_without_duplicate_handlers(
        self,
    ) -> None:
        application = create_app(self.make_settings("ERROR"))
        application_logger = logging.getLogger("app")
        original_level = application_logger.level
        self.addCleanup(application_logger.setLevel, original_level)
        async with application.router.lifespan_context(application):
            self.assertEqual(application_logger.getEffectiveLevel(), logging.ERROR)
        handler_count = len(logging.getLogger().handlers)
        async with application.router.lifespan_context(application):
            self.assertEqual(len(logging.getLogger().handlers), handler_count)
