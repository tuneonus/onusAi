"""Tests for Python ingestion worker authentication, leasing, completion, and failure callbacks."""

import hashlib
import json
import unittest

import httpx2

from app.core.config import Settings
from app.core.internal_auth import (
    EXPECTED_WORKER_SUBJECT,
    verify_internal_service_token,
)
from app.modules.ingestion.client import BackendIngestionClient, IngestionClientError
from app.modules.ingestion.worker import (
    NonRetryableIngestionError,
    process_next_ingestion_job,
)

TEST_SECRET = "test-internal-auth-secret-at-least-32-characters"


def make_settings() -> Settings:
    return Settings(
        AI_INTERNAL_AUTH_SECRET=TEST_SECRET,
        AI_GENERATION_MODE="mock",
        AI_BACKEND_SERVICE_URL="http://127.0.0.1:3000",
    )


def make_leased_payload(content_text: str = "# Hello\nWorld", sha_override: str | None = None) -> dict:
    sha = sha_override or hashlib.sha256(content_text.encode("utf-8")).hexdigest()
    return {
        "job": {
            "id": "11111111-1111-4111-8111-111111111111",
            "businessId": "22222222-2222-4222-8222-222222222222",
            "documentId": "33333333-3333-4333-8333-333333333333",
            "documentVersionId": "44444444-4444-4444-8444-444444444444",
            "status": "leased",
            "attemptCount": 1,
            "maxAttempts": 3,
            "nextAttemptAt": "2026-11-28T12:00:00.000Z",
            "leaseToken": "55555555-5555-4555-8555-555555555555",
            "leasedBy": "ai-worker-1",
            "leasedAt": "2026-11-28T12:00:00.000Z",
            "leaseExpiresAt": "2026-11-28T12:01:00.000Z",
            "lastError": None,
            "completedAt": None,
            "createdAt": "2026-11-28T12:00:00.000Z",
            "updatedAt": "2026-11-28T12:00:00.000Z",
        },
        "document": {
            "versionNumber": 1,
            "visibility": "public",
            "locationId": None,
            "sourceFilename": "guide.md",
            "mimeType": "text/markdown",
            "sourceType": "markdown",
            "byteSize": len(content_text.encode("utf-8")),
            "charCount": len(content_text),
            "contentSha256": sha,
            "contentText": content_text,
        },
    }


class IngestionWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_idle_poll_returns_none(self) -> None:
        captured_headers: dict[str, str] = {}

        def handler(request: httpx2.Request) -> httpx2.Response:
            captured_headers.update(dict(request.headers))
            return httpx2.Response(200, json={"job": None})

        client = BackendIngestionClient(
            make_settings(), transport=httpx2.MockTransport(handler)
        )
        result = await process_next_ingestion_job(client, worker_id="ai-worker-1")
        self.assertIsNone(result)
        self.assertTrue(captured_headers["authorization"].startswith("Bearer "))
        self.assertIn("x-request-id", captured_headers)

    async def test_leases_validates_and_completes_job(self) -> None:
        calls: list[tuple[str, dict]] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            body = json.loads(request.content.decode("utf-8"))
            calls.append((request.url.path, body))
            if request.url.path.endswith("/lease"):
                return httpx2.Response(200, json=make_leased_payload())
            if request.url.path.endswith("/complete"):
                completed = make_leased_payload()["job"]
                completed["status"] = "completed"
                completed["leaseToken"] = None
                completed["leaseExpiresAt"] = None
                completed["completedAt"] = "2026-11-28T12:00:05.000Z"
                return httpx2.Response(200, json={"job": completed})
            return httpx2.Response(404)

        client = BackendIngestionClient(
            make_settings(), transport=httpx2.MockTransport(handler)
        )
        result = await process_next_ingestion_job(client, worker_id="ai-worker-1")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.outcome, "completed")
        self.assertEqual(result.jobStatus, "completed")
        self.assertEqual(result.chunkVersion, "chunk-v1")
        self.assertEqual(result.chunkCount, 1)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0], "/api/v1/internal/ingestion-jobs/lease")
        self.assertEqual(
            calls[1][0],
            "/api/v1/internal/ingestion-jobs/11111111-1111-4111-8111-111111111111/complete",
        )
        self.assertEqual(calls[1][1]["chunking"]["chunkVersion"], "chunk-v1")
        self.assertEqual(len(calls[1][1]["chunking"]["chunks"]), 1)

    async def test_checksum_mismatch_reports_non_retryable_failure(self) -> None:
        calls: list[tuple[str, dict]] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            body = json.loads(request.content.decode("utf-8"))
            calls.append((request.url.path, body))
            if request.url.path.endswith("/lease"):
                return httpx2.Response(
                    200, json=make_leased_payload("Hello", sha_override="0" * 64)
                )
            if request.url.path.endswith("/fail"):
                failed = make_leased_payload()["job"]
                failed["status"] = "failed"
                failed["leaseToken"] = None
                failed["leaseExpiresAt"] = None
                failed["lastError"] = body["errorMessage"]
                return httpx2.Response(200, json={"job": failed})
            return httpx2.Response(404)

        client = BackendIngestionClient(
            make_settings(), transport=httpx2.MockTransport(handler)
        )
        result = await process_next_ingestion_job(client, worker_id="ai-worker-1")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.outcome, "failed")
        self.assertEqual(calls[1][1]["retryable"], False)

    async def test_transient_processor_error_reports_retryable_failure(self) -> None:
        calls: list[tuple[str, dict]] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            body = json.loads(request.content.decode("utf-8"))
            calls.append((request.url.path, body))
            if request.url.path.endswith("/lease"):
                return httpx2.Response(200, json=make_leased_payload())
            if request.url.path.endswith("/fail"):
                failed = make_leased_payload()["job"]
                failed["status"] = "queued"
                failed["leaseToken"] = None
                failed["leaseExpiresAt"] = None
                failed["lastError"] = body["errorMessage"]
                return httpx2.Response(200, json={"job": failed})
            return httpx2.Response(404)

        async def failing_processor(_job, _doc, _chunking) -> None:
            raise RuntimeError("Transient error")

        client = BackendIngestionClient(
            make_settings(), transport=httpx2.MockTransport(handler)
        )
        result = await process_next_ingestion_job(
            client, worker_id="ai-worker-1", processor=failing_processor
        )
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.outcome, "failed")
        self.assertEqual(result.jobStatus, "queued")
        self.assertEqual(calls[1][1]["retryable"], True)

    async def test_http_auth_error_raises_client_error(self) -> None:
        def handler(_request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(401, json={"error": {"code": "INTERNAL_AUTH_REQUIRED"}})

        client = BackendIngestionClient(
            make_settings(), transport=httpx2.MockTransport(handler)
        )
        with self.assertRaises(IngestionClientError) as ctx:
            await process_next_ingestion_job(client, worker_id="ai-worker-1")
        self.assertEqual(ctx.exception.status_code, 401)

