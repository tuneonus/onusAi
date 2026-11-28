"""Unit and live Qdrant tests for Step 06.04 vector cleanup and metadata sync worker."""

import json
import os
import unittest
import uuid

import httpx2

from app.core.config import Settings
from app.integrations.gemini_embeddings import MockEmbeddingAdapter
from app.integrations.qdrant_client import (
    QdrantVectorStore,
    build_versioned_collection_name,
)
from app.modules.ingestion.chunker import chunk_document_text
from app.modules.ingestion.cleanup_worker import process_next_cleanup_job
from app.modules.ingestion.client import BackendIngestionClient
from app.modules.ingestion.indexer import index_document_chunks
from app.modules.ingestion.schemas import LeasedDocumentPayload, LeasedJobRecord


def make_settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "_env_file": None,
        "internal_auth_secret": "test-internal-auth-secret-at-least-32-characters",
        "generation_mode": "mock",
        "backend_service_url": "http://127.0.0.1:3000",
        "qdrant_url": "http://127.0.0.1:6333",
        "qdrant_collection_prefix": "onussync_cleanup_test",
        "embedding_dimensions": 128,
    }
    base.update(overrides)
    return Settings(**base)


class CleanupWorkerUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_delete_version_and_sync_metadata_and_retry_on_qdrant_failure(self) -> None:
        settings = make_settings()
        qdrant_calls: list[tuple[str, dict]] = []
        completed_jobs: list[str] = []
        failed_jobs: list[dict] = []

        queued_jobs = [
            {
                "id": "cjob-1",
                "businessId": "biz-1",
                "documentId": "doc-1",
                "documentVersionId": "ver-1",
                "qdrantCollection": "col_v1",
                "jobType": "delete_version",
                "payload": {},
                "status": "leased",
                "attemptCount": 1,
                "maxAttempts": 5,
                "leaseToken": "lease-1",
                "lastError": None,
            },
            {
                "id": "cjob-2",
                "businessId": "biz-1",
                "documentId": "doc-1",
                "documentVersionId": None,
                "qdrantCollection": "col_v1",
                "jobType": "sync_metadata",
                "payload": {"visibility": "staff_only", "locationId": "loc-9"},
                "status": "leased",
                "attemptCount": 1,
                "maxAttempts": 5,
                "leaseToken": "lease-2",
                "lastError": None,
            },
            {
                "id": "cjob-3",
                "businessId": "biz-1",
                "documentId": "doc-1",
                "documentVersionId": None,
                "qdrantCollection": "col_v1",
                "jobType": "delete_document",
                "payload": {},
                "status": "leased",
                "attemptCount": 1,
                "maxAttempts": 5,
                "leaseToken": "lease-3",
                "lastError": None,
            },
        ]

        def backend_handler(request: httpx2.Request) -> httpx2.Response:
            if request.url.path.endswith("/lease"):
                job = queued_jobs.pop(0) if queued_jobs else None
                return httpx2.Response(200, json={"job": job})
            if request.url.path.endswith("/complete"):
                body = json.loads(request.content.decode("utf-8"))
                job_id = request.url.path.split("/")[-2]
                completed_jobs.append(job_id)
                return httpx2.Response(
                    200,
                    json={
                        "job": {
                            "id": job_id,
                            "businessId": body["businessId"],
                            "documentId": body["documentId"],
                            "documentVersionId": None,
                            "qdrantCollection": "col_v1",
                            "jobType": "delete_document",
                            "payload": {},
                            "status": "completed",
                            "attemptCount": 1,
                            "maxAttempts": 5,
                            "leaseToken": None,
                            "lastError": None,
                        }
                    },
                )
            if request.url.path.endswith("/fail"):
                body = json.loads(request.content.decode("utf-8"))
                failed_jobs.append(body)
                return httpx2.Response(
                    200,
                    json={
                        "job": {
                            "id": "cjob-3",
                            "businessId": body["businessId"],
                            "documentId": body["documentId"],
                            "documentVersionId": None,
                            "qdrantCollection": "col_v1",
                            "jobType": "delete_document",
                            "payload": {},
                            "status": "queued",
                            "attemptCount": 1,
                            "maxAttempts": 5,
                            "leaseToken": None,
                            "lastError": body["errorMessage"],
                        }
                    },
                )
            return httpx2.Response(404, json={})

        fail_qdrant = False

        def qdrant_handler(request: httpx2.Request) -> httpx2.Response:
            if fail_qdrant:
                return httpx2.Response(503, json={"status": "error"})
            body = json.loads(request.content.decode("utf-8"))
            qdrant_calls.append((request.url.path, body))
            return httpx2.Response(200, json={"result": {"status": "completed"}})

        client = BackendIngestionClient(
            settings, transport=httpx2.MockTransport(backend_handler)
        )
        store = QdrantVectorStore(
            base_url=settings.qdrant_url,
            transport=httpx2.MockTransport(qdrant_handler),
        )

        # 1. delete_version
        r1 = await process_next_cleanup_job(client, worker_id="w1", qdrant_store=store)
        self.assertIsNotNone(r1)
        assert r1 is not None
        self.assertEqual(r1.outcome, "completed")
        self.assertIn("/points/delete", qdrant_calls[0][0])
        self.assertEqual(
            qdrant_calls[0][1]["filter"]["must"],
            [
                {"key": "business_id", "match": {"value": "biz-1"}},
                {"key": "document_id", "match": {"value": "doc-1"}},
                {"key": "document_version_id", "match": {"value": "ver-1"}},
            ],
        )

        # 2. sync_metadata
        r2 = await process_next_cleanup_job(client, worker_id="w1", qdrant_store=store)
        self.assertIsNotNone(r2)
        assert r2 is not None
        self.assertEqual(r2.outcome, "completed")
        self.assertIn("/points/payload", qdrant_calls[1][0])
        self.assertEqual(
            qdrant_calls[1][1]["payload"],
            {"visibility": "staff_only", "location_id": "loc-9"},
        )

        # 3. Qdrant 503 -> retryable failure
        fail_qdrant = True
        r3 = await process_next_cleanup_job(client, worker_id="w1", qdrant_store=store)
        self.assertIsNotNone(r3)
        assert r3 is not None
        self.assertEqual(r3.outcome, "failed")
        self.assertEqual(r3.jobStatus, "queued")
        self.assertTrue(failed_jobs[0]["retryable"])
        self.assertEqual(completed_jobs, ["cjob-1", "cjob-2"])


class LiveQdrantCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_qdrant_version_cleanup_metadata_sync_and_tenant_isolation(self) -> None:
        qdrant_url = os.environ.get("AI_QDRANT_URL", "http://127.0.0.1:6333")
        async with httpx2.AsyncClient(timeout=2.0) as probe:
            try:
                ready = await probe.get(f"{qdrant_url}/readyz")
                if ready.status_code != 200:
                    self.skipTest("Qdrant is not ready.")
            except httpx2.HTTPError:
                self.skipTest("Qdrant is not reachable.")

        prefix = f"onussync_cln_it_{uuid.uuid4().hex[:8]}"
        collection = build_versioned_collection_name(prefix, "embed-v1", 128)
        store = QdrantVectorStore(base_url=qdrant_url)
        adapter = MockEmbeddingAdapter(dimensions=128)

        tenant_a = str(uuid.uuid4())
        tenant_b = str(uuid.uuid4())
        doc_a = str(uuid.uuid4())
        ver_a1 = str(uuid.uuid4())
        ver_a2 = str(uuid.uuid4())
        doc_b = str(uuid.uuid4())
        ver_b1 = str(uuid.uuid4())

        try:
            async def seed(biz: str, doc_id: str, ver_id: str, text: str) -> None:
                job = LeasedJobRecord(
                    id=str(uuid.uuid4()),
                    businessId=biz,
                    documentId=doc_id,
                    documentVersionId=ver_id,
                    status="leased",
                    attemptCount=1,
                    maxAttempts=3,
                    nextAttemptAt="2026-11-28T00:00:00Z",
                    createdAt="2026-11-28T00:00:00Z",
                    updatedAt="2026-11-28T00:00:00Z",
                )
                doc = LeasedDocumentPayload(
                    versionNumber=1,
                    visibility="public",
                    locationId=None,
                    sourceFilename="doc.txt",
                    mimeType="text/plain",
                    sourceType="txt",
                    byteSize=len(text),
                    charCount=len(text),
                    contentSha256="a" * 64,
                    contentText=text,
                )
                chunking = chunk_document_text(
                    document_version_id=ver_id,
                    source_type="txt",
                    raw_text=text,
                    chunk_version="chunk-v1",
                    chunk_max_chars=800,
                    chunk_overlap_chars=120,
                )
                await index_document_chunks(
                    job=job,
                    document=doc,
                    chunking=chunking,
                    embedding_adapter=adapter,
                    qdrant_store=store,
                    collection_prefix=prefix,
                )

            await seed(tenant_a, doc_a, ver_a1, "Tenant A v1")
            await seed(tenant_a, doc_a, ver_a2, "Tenant A v2")
            await seed(tenant_b, doc_b, ver_b1, "Tenant B v1")

            # Delete only ver_a1
            await store.delete_points_by_filter(
                collection,
                filter_body={
                    "must": [
                        {"key": "business_id", "match": {"value": tenant_a}},
                        {"key": "document_id", "match": {"value": doc_a}},
                        {"key": "document_version_id", "match": {"value": ver_a1}},
                    ]
                },
            )
            self.assertEqual(
                await store.count_points(
                    collection,
                    {"must": [{"key": "business_id", "match": {"value": tenant_a}}]},
                ),
                1,
            )

            # Sync metadata on doc_a
            await store.set_payload_by_filter(
                collection,
                payload={"visibility": "staff_only", "location_id": "loc-new"},
                filter_body={
                    "must": [
                        {"key": "business_id", "match": {"value": tenant_a}},
                        {"key": "document_id", "match": {"value": doc_a}},
                    ]
                },
            )
            pts_a = await store.scroll_points(
                collection,
                {"must": [{"key": "business_id", "match": {"value": tenant_a}}]},
            )
            self.assertEqual(pts_a[0]["payload"]["visibility"], "staff_only")
            self.assertEqual(pts_a[0]["payload"]["location_id"], "loc-new")

            # Delete all points for doc_a -> tenant_b untouched
            await store.delete_points_by_filter(
                collection,
                filter_body={
                    "must": [
                        {"key": "business_id", "match": {"value": tenant_a}},
                        {"key": "document_id", "match": {"value": doc_a}},
                    ]
                },
            )
            self.assertEqual(
                await store.count_points(
                    collection,
                    {"must": [{"key": "business_id", "match": {"value": tenant_a}}]},
                ),
                0,
            )
            self.assertEqual(
                await store.count_points(
                    collection,
                    {"must": [{"key": "business_id", "match": {"value": tenant_b}}]},
                ),
                1,
            )
        finally:
            async with httpx2.AsyncClient(timeout=2.0) as cleanup:
                await cleanup.delete(f"{qdrant_url}/collections/{collection}")

