"""Unit tests for FastAPI internal HS256 JWT verification and edge cases."""

import base64
import hashlib
import hmac
import json
import unittest
from typing import Any

from fastapi import HTTPException

from app.core.config import Settings
from app.core.internal_auth import verify_internal_service_token

TEST_INTERNAL_SECRET = "test-internal-auth-secret-at-least-32-characters"
FIXED_NOW = 1_700_000_000


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def build_raw_jwt(
    header: Any,
    payload: Any,
    *,
    secret: str = TEST_INTERNAL_SECRET,
) -> str:
    header_b64 = b64url_encode(
        json.dumps(header, separators=(",", ":")).encode("utf-8")
    )
    payload_b64 = b64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature_b64 = b64url_encode(
        hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    )
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def default_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "iss": "onussync-backend",
        "aud": "onussync-ai-backend",
        "sub": "service:backend",
        "iat": FIXED_NOW,
        "exp": FIXED_NOW + 60,
        "jti": "fixture-token-id-1",
        "scope": "ai:health",
    }
    payload.update(overrides)
    return payload


class InternalAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = Settings(
            _env_file=None,
            internal_auth_secret=TEST_INTERNAL_SECRET,
            internal_auth_clock_skew_seconds=0,
            internal_auth_max_ttl_seconds=300,
            generation_mode="mock",
        )

    def test_accepts_valid_token_and_multiple_scopes(self) -> None:
        token = build_raw_jwt(
            {"alg": "HS256", "typ": "JWT"},
            default_payload(scope="ai:chat ai:health"),
        )
        with self.assertNoLogs("app.core.internal_auth", level="WARNING"):
            context = verify_internal_service_token(
                token,
                self.settings,
                now_seconds=FIXED_NOW + 59,
                required_scope="ai:health",
            )

        self.assertEqual(context.issuer, "onussync-backend")
        self.assertEqual(context.audience, "onussync-ai-backend")
        self.assertEqual(context.subject, "service:backend")
        self.assertEqual(context.token_id, "fixture-token-id-1")
        self.assertEqual(context.scopes, frozenset({"ai:chat", "ai:health"}))

    def test_cross_language_node_fixture_verifies(self) -> None:
        # Exact HS256 JWT produced by backend/src/integrations/ai/ai-auth.ts.
        node_generated_token = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJpc3MiOiJvbnVzc3luYy1iYWNrZW5kIiwiYXVkIjoib251c3N5bmMtYWktYmFja2VuZCIsInN1YiI6InNlcnZpY2U6YmFja2VuZCIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwMDYwLCJqdGkiOiJmaXh0dXJlLXRva2VuLWlkLTEiLCJzY29wZSI6ImFpOmhlYWx0aCJ9."
            "-obfmPUdE3I0V9w_tTFG1VkmSzsIpX9V6mLAbOsEpbU"
        )
        context = verify_internal_service_token(
            node_generated_token,
            self.settings,
            now_seconds=FIXED_NOW + 10,
            required_scope="ai:health",
        )
        self.assertEqual(context.issuer, "onussync-backend")
        self.assertEqual(context.audience, "onussync-ai-backend")
        self.assertEqual(context.subject, "service:backend")
        self.assertEqual(context.token_id, "fixture-token-id-1")
        self.assertEqual(context.scopes, frozenset({"ai:health"}))

    def test_rejects_algorithm_confusion_and_malformed_tokens(self) -> None:
        malformed_tokens = [
            "",
            "not-a-jwt",
            "a.b",
            "a.b.c.d",
            "a..c",
            "x" * 4097,
            build_raw_jwt({"alg": "none", "typ": "JWT"}, default_payload()),
            build_raw_jwt({"alg": "RS256", "typ": "JWT"}, default_payload()),
            build_raw_jwt({"alg": "HS256", "typ": "OTHER"}, default_payload()),
            build_raw_jwt(["HS256"], default_payload()),
            build_raw_jwt({"alg": "HS256", "typ": "JWT"}, ["bad-payload"]),
        ]

        with self.assertLogs("app.core.internal_auth", level="WARNING") as captured:
            for token in malformed_tokens:
                with self.assertRaises(HTTPException) as raised:
                    verify_internal_service_token(
                        token, self.settings, now_seconds=FIXED_NOW
                    )
                self.assertEqual(raised.exception.status_code, 401)
                self.assertEqual(raised.exception.headers, {"WWW-Authenticate": "Bearer"})

        joined_logs = " ".join(captured.output)
        self.assertNotIn(TEST_INTERNAL_SECRET, joined_logs)
        self.assertNotIn("fixture-token-id-1", joined_logs)

    def test_rejects_tampered_payload_or_wrong_secret(self) -> None:
        valid_token = build_raw_jwt(
            {"alg": "HS256", "typ": "JWT"}, default_payload()
        )
        header_b64, _, sig_b64 = valid_token.split(".")
        tampered_payload = b64url_encode(
            json.dumps(default_payload(scope="ai:admin"), separators=(",", ":")).encode(
                "utf-8"
            )
        )
        tampered_token = f"{header_b64}.{tampered_payload}.{sig_b64}"

        wrong_secret_token = build_raw_jwt(
            {"alg": "HS256", "typ": "JWT"},
            default_payload(),
            secret="different-internal-auth-secret-at-least-32-chars",
        )

        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            for token in (tampered_token, wrong_secret_token):
                with self.assertRaises(HTTPException) as raised:
                    verify_internal_service_token(
                        token, self.settings, now_seconds=FIXED_NOW
                    )
                self.assertEqual(raised.exception.status_code, 401)

    def test_rejects_invalid_claims_bool_timestamps_and_excessive_ttl(self) -> None:
        invalid_claim_payloads = [
            default_payload(iss="wrong-issuer"),
            default_payload(aud="wrong-audience"),
            default_payload(sub="user:123"),
            default_payload(jti=""),
            default_payload(iat=True),
            default_payload(exp=True),
            default_payload(iat=float(FIXED_NOW)),
            default_payload(exp=FIXED_NOW),
            default_payload(exp=FIXED_NOW - 1),
            default_payload(exp=FIXED_NOW + 301),
            default_payload(scope="   "),
        ]

        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            for payload in invalid_claim_payloads:
                token = build_raw_jwt({"alg": "HS256", "typ": "JWT"}, payload)
                with self.assertRaises(HTTPException) as raised:
                    verify_internal_service_token(
                        token, self.settings, now_seconds=FIXED_NOW
                    )
                self.assertEqual(raised.exception.status_code, 401)

    def test_enforces_expiration_and_clock_skew(self) -> None:
        token = build_raw_jwt({"alg": "HS256", "typ": "JWT"}, default_payload())

        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            with self.assertRaises(HTTPException) as expired_exc:
                verify_internal_service_token(
                    token, self.settings, now_seconds=FIXED_NOW + 60
                )
            self.assertEqual(expired_exc.exception.status_code, 401)
            self.assertEqual(
                expired_exc.exception.detail, "Internal service token has expired."
            )

            with self.assertRaises(HTTPException) as future_exc:
                verify_internal_service_token(
                    token, self.settings, now_seconds=FIXED_NOW - 1
                )
            self.assertEqual(future_exc.exception.status_code, 401)

        skew_settings = Settings(
            _env_file=None,
            internal_auth_secret=TEST_INTERNAL_SECRET,
            internal_auth_clock_skew_seconds=5,
            generation_mode="mock",
        )
        context = verify_internal_service_token(
            token, skew_settings, now_seconds=FIXED_NOW + 64
        )
        self.assertEqual(context.subject, "service:backend")

        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            with self.assertRaises(HTTPException):
                verify_internal_service_token(
                    token, skew_settings, now_seconds=FIXED_NOW + 65
                )

    def test_rejects_insufficient_scope_with_403(self) -> None:
        token = build_raw_jwt(
            {"alg": "HS256", "typ": "JWT"},
            default_payload(scope="ai:health"),
        )
        with self.assertLogs("app.core.internal_auth", level="WARNING"):
            with self.assertRaises(HTTPException) as raised:
                verify_internal_service_token(
                    token,
                    self.settings,
                    now_seconds=FIXED_NOW,
                    required_scope="ai:generate",
                )
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(
            raised.exception.detail, "Insufficient internal service scope."
        )
