"""Exercise the assembled application over a real loopback HTTP connection."""

import json
import logging
import socket
import threading
import time
import unittest
from typing import Any
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import uvicorn
from fastapi import HTTPException

from app.core.config import Settings
from app.main import create_app


class ApplicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        application = create_app(
            Settings(_env_file=None, app_name="Test AI Service", log_level="INFO")
        )

        # Failure fixtures belong only to this test application.
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

        listener = socket.socket()
        cls.addClassCleanup(listener.close)
        listener.bind(("127.0.0.1", 0))
        cls.port = listener.getsockname()[1]

        # The application handler is checked below; silence Uvicorn's duplicate
        # traceback for the intentional failure fixture.
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
        self, path: str, method: str = "GET"
    ) -> tuple[int, dict[str, str], dict[str, Any]]:
        request = Request(f"http://127.0.0.1:{self.port}{path}", method=method)
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

    def test_health(self) -> None:
        status_code, headers, body = self.request("/api/v1/health")

        self.assertEqual(status_code, 200)
        self.assertEqual(headers["content-type"], "application/json")
        self.assertEqual(body, {"status": "ok"})

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
            status_code, _, body = self.request("/_tests/failure")

        self.assertEqual(status_code, 500)
        self.assertEqual(body, {"detail": "Internal server error."})
        self.assertIn("RuntimeError", " ".join(captured.output))
        self.assertNotIn("Simulated internal failure", json.dumps(body))
        self.assertNotIn("Simulated internal failure", " ".join(captured.output))

    def test_openapi_includes_versioned_health_route(self) -> None:
        status_code, _, schema = self.request("/openapi.json")

        self.assertEqual(status_code, 200)
        self.assertEqual(schema["info"]["title"], "Test AI Service")
        self.assertIn("get", schema["paths"]["/api/v1/health"])


class LifespanTests(unittest.IsolatedAsyncioTestCase):
    async def test_startup_and_shutdown_are_logged(self) -> None:
        application = create_app(Settings(_env_file=None, log_level="INFO"))

        with self.assertLogs("app.main", level="INFO") as captured:
            async with application.router.lifespan_context(application):
                self.assertIn("Starting", captured.output[0])

        self.assertIn("Stopped", captured.output[-1])

    async def test_shutdown_is_logged_after_failure(self) -> None:
        application = create_app(Settings(_env_file=None, log_level="INFO"))

        with self.assertLogs("app.main", level="INFO") as captured:
            with self.assertRaises(RuntimeError):
                async with application.router.lifespan_context(application):
                    raise RuntimeError("Simulated lifespan failure")

        self.assertIn("Stopped", captured.output[-1])

    async def test_logging_uses_configured_level_without_duplicate_handlers(self) -> None:
        application = create_app(Settings(_env_file=None, log_level="ERROR"))
        application_logger = logging.getLogger("app")
        original_level = application_logger.level
        self.addCleanup(application_logger.setLevel, original_level)
        async with application.router.lifespan_context(application):
            self.assertEqual(application_logger.getEffectiveLevel(), logging.ERROR)
        handler_count = len(logging.getLogger().handlers)
        async with application.router.lifespan_context(application):
            self.assertEqual(len(logging.getLogger().handlers), handler_count)
