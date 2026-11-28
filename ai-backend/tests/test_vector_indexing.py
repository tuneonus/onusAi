"""Unit and live Qdrant/Gemini tests for Step 06.01 vector indexing."""

import json
import os
import unittest
import uuid
from unittest.mock import patch

import httpx2
from google.genai import errors as genai_errors

from app.core.config import Settings
from app.integrations.gemini_embeddings import (
    GeminiEmbeddingAdapter,
    GeminiEmbeddingError,
    MockEmbeddingAdapter,
)
from app.integrations.qdrant_client import (
    QdrantError,
    QdrantPoint,
    QdrantVectorStore,
    build_versioned_collection_name,
)
from app.modules.ingestion.client import BackendIngestionClient
from app.modules.ingestion.indexer import (
    build_deterministic_vector_id,
    index_document_chunks,
)
from app.modules.ingestion.schemas import (
    LeasedDocumentPayload,
    LeasedJobRecord,
)
from app.modules.ingestion.worker import process_next_ingestion_job


def make_settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "internal_auth_secret": "test-internal-auth-secret-at-least-32-characters",
        "generation_mode": "mock",
        "backend_service_url": "http://127.0.0.1:3000",
        "qdrant_url": "http://127.0.0.1:6333",
        "qdrant_collection_prefix": "onussync_test_chunks",
        "embedding_model": "gemini-embedding-001",
        "embedding_dimensions": 768,
        "embedding_model_version": "embed-v1",
        "embedding_batch_size": 2,
        "embedding_max_retries": 2,
        "embedding_retry_base_delay_ms": 10,
    }
    base.update(overrides)
    return Settings(**base)


class FakeEmbedding:
    def __init__(self, values: list[float]) -> None:
        self.values = values


class FakeEmbedResponse:
    def __init__(self, vectors: list[list[float]]) -> None:
        self.embeddings = [FakeEmbedding(v) for v in vectors]


class FakeAsyncModels:
    def __init__(self, fn) -> None:
        self._fn = fn

    async def embed_content(self, *, model: str, contents: list[str], config):
        return await self._fn(model=model, contents=contents, config=config)


class FakeAio:
    def __init__(self, fn) -> None:
        self.models = FakeAsyncModels(fn)

    async def aclose(self) -> None:
        return None


class FakeGenaiClient:
    def __init__(self, fn) -> None:
        self.aio = FakeAio(fn)


class VectorIndexingUnitTests(unittest.IsolatedAsyncioTestCase):
    def test_deterministic_vector_ids_and_versioned_collection_names(self) -> None:
        chunk_id = str(uuid.uuid4())
        id1 = build_deterministic_vector_id(
            chunk_id=chunk_id,
            embedding_model_version="embed-v1",
            embedding_dimensions=768,
        )
        id2 = build_deterministic_vector_id(
            chunk_id=chunk_id,
            embedding_model_version="embed-v1",
            embedding_dimensions=768,
        )
        id_v2 = build_deterministic_vector_id(
            chunk_id=chunk_id,
            embedding_model_version="embed-v2",
            embedding_dimensions=768,
        )
        id_1536 = build_deterministic_vector_id(
            chunk_id=chunk_id,
            embedding_model_version="embed-v1",
            embedding_dimensions=1536,
        )
        self.assertEqual(id1, id2)
        self.assertNotEqual(id1, id_v2)
        self.assertNotEqual(id1, id_1536)
        self.assertEqual(
            build_versioned_collection_name("onussync_chunks", "embed-v1", 768),
            "onussync_chunks__embed-v1__d768",
        )

    async def test_gemini_embedding_batching_and_retry_on_transient_429(self) -> None:
        calls: list[list[str]] = []

        async def fake_embed(*, model: str, contents: list[str], config):
            calls.append(list(contents))
            if len(calls) == 1:
                raise genai_errors.APIError(429, {"error": {"message": "Rate limit"}}, None)
            return FakeEmbedResponse([[0.1] * 128 for _ in contents])

        adapter = GeminiEmbeddingAdapter(
            api_key="test-key-123456",
            model="gemini-embedding-001",
            model_version="embed-v1",
            dimensions=128,
            batch_size=2,
            max_retries=2,
            retry_base_delay_ms=10,
            client=FakeGenaiClient(fake_embed),
        )
        vectors = await adapter.embed_documents(["c1", "c2", "c3"])
        self.assertEqual(len(vectors), 3)
        self.assertEqual(len(vectors[0]), 128)
        # First batch retried once, second batch succeeded on first try -> 3 calls
        self.assertEqual(calls, [["c1", "c2"], ["c1", "c2"], ["c3"]])

    async def test_gemini_embedding_rejects_dimension_mismatch_non_retryably(self) -> None:
        async def bad_dim(*, model: str, contents: list[str], config):
            return FakeEmbedResponse([[0.1] * 64 for _ in contents])

        adapter = GeminiEmbeddingAdapter(
            api_key="test-key-123456",
            dimensions=128,
            max_retries=2,
            retry_base_delay_ms=10,
            client=FakeGenaiClient(bad_dim),
        )
        with self.assertRaises(GeminiEmbeddingError) as ctx:
            await adapter.embed_documents(["hello"])
        self.assertFalse(ctx.exception.retryable)

    async def test_qdrant_incompatible_collection_raises_non_retryable(self) -> None:
        def handler(request: httpx2.Request) -> httpx2.Response:
            if request.method == "GET" and request.url.path == "/collections/col_v1":
                return httpx2.Response(
                    200,
                    json={
                        "result": {
                            "config": {
                                "params": {
                                    "vectors": {"size": 1536, "distance": "Cosine"}
                                }
                            }
                        }
                    },
                )
            return httpx2.Response(404, json={})

        store = QdrantVectorStore(
            base_url="http://127.0.0.1:6333",
            transport=httpx2.MockTransport(handler),
        )
        with self.assertRaises(QdrantError) as ctx:
            await store.ensure_collection("col_v1", 768)
        self.assertFalse(ctx.exception.retryable)

    async def test_worker_embeds_existing_chunks_and_completes_with_indexing_metadata(self) -> None:
        settings = make_settings()
        recorded_complete_payloads: list[dict] = []
        upserted_points: list[dict] = []

        doc_text = "# Policies\n\nCheck-in starts at 2 PM."
        import hashlib

        doc_sha = hashlib.sha256(doc_text.encode("utf-8")).hexdigest()
        existing_chunk_id = str(uuid.uuid4())

        def backend_handler(request: httpx2.Request) -> httpx2.Response:
            if request.url.path.endswith("/lease"):
                return httpx2.Response(
                    200,
                    json={
                        "job": {
                            "id": "job-1",
                            "businessId": "biz-1",
                            "documentId": "doc-1",
                            "documentVersionId": "ver-1",
                            "status": "leased",
                            "attemptCount": 1,
                            "maxAttempts": 3,
                            "nextAttemptAt": "2026-11-28T00:00:00Z",
                            "leaseToken": "lease-1",
                            "leasedBy": "worker-1",
                            "leasedAt": "2026-11-28T00:00:00Z",
                            "leaseExpiresAt": "2026-11-28T00:01:00Z",
                            "lastError": None,
                            "completedAt": None,
                            "createdAt": "2026-11-28T00:00:00Z",
                            "updatedAt": "2026-11-28T00:00:00Z",
                        },
                        "document": {
                            "versionNumber": 1,
                            "visibility": "public",
                            "locationId": "loc-1",
                            "sourceFilename": "policies.md",
                            "mimeType": "text/markdown",
                            "sourceType": "markdown",
                            "byteSize": len(doc_text.encode("utf-8")),
                            "charCount": len(doc_text),
                            "contentSha256": doc_sha,
                            "contentText": doc_text,
                            "existingChunkVersion": "chunk-v1",
                            "existingNormalizedCharCount": len(doc_text),
                            "existingNormalizedSha256": doc_sha,
                            "existingChunks": [
                                {
                                    "chunkId": existing_chunk_id,
                                    "chunkIndex": 0,
                                    "headingPath": ["Policies"],
                                    "charStart": 0,
                                    "charEnd": len(doc_text),
                                    "charCount": len(doc_text),
                                    "contentSha256": doc_sha,
                                    "chunkText": doc_text,
                                }
                            ],
                        },
                    },
                )
            if request.url.path.endswith("/complete"):
                body = json.loads(request.content.decode("utf-8"))
                recorded_complete_payloads.append(body)
                return httpx2.Response(
                    200,
                    json={
                        "job": {
                            "id": "job-1",
                            "businessId": "biz-1",
                            "documentId": "doc-1",
                            "documentVersionId": "ver-1",
                            "status": "completed",
                            "attemptCount": 1,
                            "maxAttempts": 3,
                            "nextAttemptAt": "2026-11-28T00:00:00Z",
                            "leaseToken": None,
                            "leasedBy": None,
                            "leasedAt": None,
                            "leaseExpiresAt": None,
                            "lastError": None,
                            "completedAt": "2026-11-28T00:00:02Z",
                            "createdAt": "2026-11-28T00:00:00Z",
                            "updatedAt": "2026-11-28T00:00:02Z",
                        }
                    },
                )
            return httpx2.Response(404, json={})

        collection_created = False

        def qdrant_handler(request: httpx2.Request) -> httpx2.Response:
            nonlocal collection_created
            if request.method == "GET" and "/collections/" in request.url.path:
                if not collection_created:
                    return httpx2.Response(404, json={"status": "error"})
                return httpx2.Response(
                    200,
                    json={"result": {"config": {"params": {"vectors": {"size": 768, "distance": "Cosine"}}}}},
                )
            if request.method == "PUT" and request.url.path.endswith("/index"):
                return httpx2.Response(200, json={"result": {"operation_id": 1}})
            if request.method == "PUT" and "/points" in request.url.path:
                body = json.loads(request.content.decode("utf-8"))
                upserted_points.extend(body["points"])
                return httpx2.Response(200, json={"result": {"status": "completed"}})
            if request.method == "PUT" and "/collections/" in request.url.path:
                collection_created = True
                return httpx2.Response(200, json={"result": True})
            return httpx2.Response(404, json={})

        client = BackendIngestionClient(
            settings,
            transport=httpx2.MockTransport(backend_handler),
        )
        qdrant = QdrantVectorStore(
            base_url=settings.qdrant_url,
            transport=httpx2.MockTransport(qdrant_handler),
        )
        result = await process_next_ingestion_job(
            client,
            worker_id="worker-1",
            qdrant_store=qdrant,
        )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.outcome, "completed")
        self.assertEqual(result.qdrantCollection, "onussync_test_chunks__embed-v1__d768")
        self.assertEqual(result.indexedChunkCount, 1)
        self.assertEqual(len(upserted_points), 1)
        payload = upserted_points[0]["payload"]
        self.assertEqual(payload["business_id"], "biz-1")
        self.assertEqual(payload["document_id"], "doc-1")
        self.assertEqual(payload["document_version_id"], "ver-1")
        self.assertEqual(payload["location_id"], "loc-1")
        self.assertEqual(payload["visibility"], "public")
        self.assertEqual(payload["source_filename"], "policies.md")
        self.assertEqual(payload["chunk_id"], existing_chunk_id)
        self.assertEqual(len(recorded_complete_payloads), 1)
        self.assertEqual(
            recorded_complete_payloads[0]["indexing"]["qdrantCollection"],
            "onussync_test_chunks__embed-v1__d768",
        )

    async def test_worker_marks_job_failed_when_qdrant_upsert_fails(self) -> None:
        settings = make_settings()
        fail_payloads: list[dict] = []
        complete_called = False
        doc_text = "Sample document text."
        import hashlib

        doc_sha = hashlib.sha256(doc_text.encode("utf-8")).hexdigest()

        def backend_handler(request: httpx2.Request) -> httpx2.Response:
            nonlocal complete_called
            if request.url.path.endswith("/lease"):
                return httpx2.Response(
                    200,
                    json={
                        "job": {
                            "id": "job-2",
                            "businessId": "biz-1",
                            "documentId": "doc-2",
                            "documentVersionId": "ver-2",
                            "status": "leased",
                            "attemptCount": 1,
                            "maxAttempts": 3,
                            "nextAttemptAt": "2026-11-28T00:00:00Z",
                            "leaseToken": "lease-2",
                            "leasedBy": "worker-1",
                            "leasedAt": "2026-11-28T00:00:00Z",
                            "leaseExpiresAt": "2026-11-28T00:01:00Z",
                            "lastError": None,
                            "completedAt": None,
                            "createdAt": "2026-11-28T00:00:00Z",
                            "updatedAt": "2026-11-28T00:00:00Z",
                        },
                        "document": {
                            "versionNumber": 1,
                            "visibility": "staff_only",
                            "locationId": None,
                            "sourceFilename": "guide.txt",
                            "mimeType": "text/plain",
                            "sourceType": "txt",
                            "byteSize": len(doc_text.encode("utf-8")),
                            "charCount": len(doc_text),
                            "contentSha256": doc_sha,
                            "contentText": doc_text,
                        },
                    },
                )
            if request.url.path.endswith("/complete"):
                complete_called = True
                return httpx2.Response(200, json={})
            if request.url.path.endswith("/fail"):
                fail_payloads.append(json.loads(request.content.decode("utf-8")))
                return httpx2.Response(
                    200,
                    json={
                        "job": {
                            "id": "job-2",
                            "businessId": "biz-1",
                            "documentId": "doc-2",
                            "documentVersionId": "ver-2",
                            "status": "queued",
                            "attemptCount": 1,
                            "maxAttempts": 3,
                            "nextAttemptAt": "2026-11-28T00:00:00Z",
                            "leaseToken": None,
                            "leasedBy": None,
                            "leasedAt": None,
                            "leaseExpiresAt": None,
                            "lastError": "Qdrant unavailable",
                            "completedAt": None,
                            "createdAt": "2026-11-28T00:00:00Z",
                            "updatedAt": "2026-11-28T00:00:01Z",
                        }
                    },
                )
            return httpx2.Response(404, json={})

        def qdrant_down(request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(503, json={"status": "error"})

        client = BackendIngestionClient(
            settings,
            transport=httpx2.MockTransport(backend_handler),
        )
        qdrant = QdrantVectorStore(
            base_url=settings.qdrant_url,
            transport=httpx2.MockTransport(qdrant_down),
        )
        result = await process_next_ingestion_job(
            client,
            worker_id="worker-1",
            qdrant_store=qdrant,
        )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.outcome, "failed")
        self.assertFalse(complete_called)
        self.assertEqual(len(fail_payloads), 1)
        self.assertTrue(fail_payloads[0]["retryable"])


class LiveQdrantIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_qdrant_versioned_collection_idempotent_upsert_and_tenant_isolation(self) -> None:
        qdrant_url = os.environ.get("AI_QDRANT_URL", "http://127.0.0.1:6333")
        async with httpx2.AsyncClient(timeout=2.0) as probe:
            try:
                ready = await probe.get(f"{qdrant_url}/readyz")
                if ready.status_code != 200:
                    self.skipTest("Qdrant is not ready.")
            except httpx2.HTTPError:
                self.skipTest("Qdrant is not reachable.")

        prefix = f"onussync_it_{uuid.uuid4().hex[:10]}"
        collection = build_versioned_collection_name(prefix, "embed-v1", 128)
        store = QdrantVectorStore(base_url=qdrant_url)

        try:
            adapter = MockEmbeddingAdapter(
                model="gemini-embedding-001",
                model_version="embed-v1",
                dimensions=128,
            )
            from app.modules.ingestion.chunker import chunk_document_text

            job_a = LeasedJobRecord(
                id=str(uuid.uuid4()),
                businessId="tenant-a",
                documentId="doc-a",
                documentVersionId="ver-a",
                status="leased",
                attemptCount=1,
                maxAttempts=3,
                nextAttemptAt="2026-11-28T00:00:00Z",
                createdAt="2026-11-28T00:00:00Z",
                updatedAt="2026-11-28T00:00:00Z",
            )
            doc_a = LeasedDocumentPayload(
                versionNumber=1,
                visibility="public",
                locationId="loc-a",
                sourceFilename="a.md",
                mimeType="text/markdown",
                sourceType="markdown",
                byteSize=24,
                charCount=24,
                contentSha256="a" * 64,
                contentText="# Alpha\n\nAlpha hours 9-5",
            )
            chunking_a = chunk_document_text(
                document_version_id=job_a.documentVersionId,
                source_type="markdown",
                raw_text=doc_a.contentText,
                chunk_version="chunk-v1",
                chunk_max_chars=800,
                chunk_overlap_chars=120,
            )

            # First index + idempotent re-index
            await index_document_chunks(
                job=job_a,
                document=doc_a,
                chunking=chunking_a,
                embedding_adapter=adapter,
                qdrant_store=store,
                collection_prefix=prefix,
            )
            await index_document_chunks(
                job=job_a,
                document=doc_a,
                chunking=chunking_a,
                embedding_adapter=adapter,
                qdrant_store=store,
                collection_prefix=prefix,
            )

            # Second tenant in same collection
            job_b = LeasedJobRecord(
                id=str(uuid.uuid4()),
                businessId="tenant-b",
                documentId="doc-b",
                documentVersionId="ver-b",
                status="leased",
                attemptCount=1,
                maxAttempts=3,
                nextAttemptAt="2026-11-28T00:00:00Z",
                createdAt="2026-11-28T00:00:00Z",
                updatedAt="2026-11-28T00:00:00Z",
            )
            doc_b = LeasedDocumentPayload(
                versionNumber=1,
                visibility="staff_only",
                locationId=None,
                sourceFilename="b.txt",
                mimeType="text/plain",
                sourceType="txt",
                byteSize=18,
                charCount=18,
                contentSha256="b" * 64,
                contentText="Beta internal note",
            )
            chunking_b = chunk_document_text(
                document_version_id=job_b.documentVersionId,
                source_type="txt",
                raw_text=doc_b.contentText,
                chunk_version="chunk-v1",
                chunk_max_chars=800,
                chunk_overlap_chars=120,
            )
            await index_document_chunks(
                job=job_b,
                document=doc_b,
                chunking=chunking_b,
                embedding_adapter=adapter,
                qdrant_store=store,
                collection_prefix=prefix,
            )

            count_a = await store.count_points(
                collection,
                {"must": [{"key": "business_id", "match": {"value": "tenant-a"}}]},
            )
            count_b = await store.count_points(
                collection,
                {"must": [{"key": "business_id", "match": {"value": "tenant-b"}}]},
            )
            self.assertEqual(count_a, 1)
            self.assertEqual(count_b, 1)

            points_a = await store.scroll_points(
                collection,
                {"must": [{"key": "business_id", "match": {"value": "tenant-a"}}]},
            )
            self.assertEqual(len(points_a), 1)
            self.assertEqual(points_a[0]["payload"]["visibility"], "public")
            self.assertEqual(points_a[0]["payload"]["location_id"], "loc-a")
            self.assertEqual(points_a[0]["payload"]["embedding_model_version"], "embed-v1")

            # Incompatible dimension check against existing live collection
            with self.assertRaises(QdrantError) as err:
                await store.ensure_collection(collection, 256)
            self.assertFalse(err.exception.retryable)
        finally:
            async with httpx2.AsyncClient(timeout=2.0) as cleanup:
                await cleanup.delete(f"{qdrant_url}/collections/{collection}")

