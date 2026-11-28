"""Unit and live Qdrant tests for Step 06.02 query embedding and scoped semantic search."""

import json
import os
import time
import unittest
import uuid

import httpx2
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.internal_auth import sign_worker_service_token
from app.integrations.gemini_embeddings import (
    GeminiEmbeddingAdapter,
    GeminiEmbeddingError,
    MockEmbeddingAdapter,
)
from app.integrations.qdrant_client import (
    QdrantVectorStore,
    build_versioned_collection_name,
)
from app.main import create_app
from app.modules.ingestion.chunker import chunk_document_text
from app.modules.ingestion.indexer import index_document_chunks
from app.modules.ingestion.schemas import LeasedDocumentPayload, LeasedJobRecord
from app.modules.retrieval.schemas import AiRetrieveRequest
from app.modules.retrieval.service import (
    build_qdrant_search_filter,
    perform_scoped_retrieval,
)


def make_settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "internal_auth_secret": "test-internal-auth-secret-at-least-32-characters",
        "generation_mode": "mock",
        "backend_service_url": "http://127.0.0.1:3000",
        "qdrant_url": "http://127.0.0.1:6333",
        "qdrant_collection_prefix": "onussync_ret_test",
        "embedding_model": "gemini-embedding-001",
        "embedding_dimensions": 128,
        "embedding_model_version": "embed-v1",
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


class RetrievalUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_gemini_embed_query_uses_retrieval_query_task_type(self) -> None:
        captured: list[tuple[str, list[str], str | None, int | None]] = []

        async def fake_embed(*, model: str, contents: list[str], config):
            captured.append(
                (model, list(contents), config.task_type, config.output_dimensionality)
            )
            return FakeEmbedResponse([[0.25] * 128])

        adapter = GeminiEmbeddingAdapter(
            api_key="test-key-123456",
            model="gemini-embedding-001",
            model_version="embed-v1",
            dimensions=128,
            client=FakeGenaiClient(fake_embed),
        )
        vec = await adapter.embed_query("  What is check-in time?  ")
        self.assertEqual(len(vec), 128)
        self.assertEqual(
            captured,
            [("gemini-embedding-001", ["What is check-in time?"], "RETRIEVAL_QUERY", 128)],
        )

        with self.assertRaises(GeminiEmbeddingError) as ctx:
            await adapter.embed_query("   ")
        self.assertFalse(ctx.exception.retryable)

    def test_build_qdrant_search_filter_enforces_tenant_visibility_and_location(self) -> None:
        biz_id = uuid.uuid4()
        loc_id = uuid.uuid4()
        req = AiRetrieveRequest(
            requestId="req-12345678",
            businessId=biz_id,
            allowedKnowledgeScopes=["public"],
            locationIds=[loc_id],
            includeBusinessWide=True,
            query="check in",
            deadlineAtMs=int(time.time() * 1000) + 5000,
        )
        flt = build_qdrant_search_filter(req, embedding_model_version="embed-v1")
        must = flt["must"]
        self.assertIn({"key": "business_id", "match": {"value": str(biz_id)}}, must)
        self.assertIn(
            {"key": "embedding_model_version", "match": {"value": "embed-v1"}}, must
        )
        self.assertIn({"key": "visibility", "match": {"any": ["public"]}}, must)
        self.assertIn(
            {
                "should": [
                    {"key": "location_id", "match": {"any": [str(loc_id)]}},
                    {"is_null": {"key": "location_id"}},
                ]
            },
            must,
        )

    async def test_perform_scoped_retrieval_handles_missing_collection_and_qdrant_outage(self) -> None:
        settings = make_settings()
        req = AiRetrieveRequest(
            requestId="req-12345678",
            businessId=uuid.uuid4(),
            allowedKnowledgeScopes=["public", "staff_only"],
            query="parking",
            deadlineAtMs=int(time.time() * 1000) + 5000,
        )

        def missing_col(_request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(404, json={"status": "error"})

        res = await perform_scoped_retrieval(
            req,
            settings,
            qdrant_store=QdrantVectorStore(
                base_url=settings.qdrant_url,
                transport=httpx2.MockTransport(missing_col),
            ),
        )
        self.assertEqual(res.candidate_count, 0)
        self.assertEqual(res.results, [])

        def qdrant_503(_request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(503, json={"status": "error"})

        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as exc:
            await perform_scoped_retrieval(
                req,
                settings,
                qdrant_store=QdrantVectorStore(
                    base_url=settings.qdrant_url,
                    transport=httpx2.MockTransport(qdrant_503),
                ),
            )
        self.assertEqual(exc.exception.status_code, 503)

    async def test_perform_scoped_retrieval_validates_candidates_via_backend(self) -> None:
        settings = make_settings()
        biz_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        ver_id = uuid.uuid4()
        chunk_id = uuid.uuid4()
        stale_chunk_id = uuid.uuid4()

        req = AiRetrieveRequest(
            requestId="req-12345678",
            businessId=biz_id,
            allowedKnowledgeScopes=["public"],
            query="check in",
            topK=5,
            scoreThreshold=0.1,
            deadlineAtMs=int(time.time() * 1000) + 5000,
        )

        def qdrant_handler(request: httpx2.Request) -> httpx2.Response:
            if request.method == "GET":
                return httpx2.Response(
                    200,
                    json={
                        "result": {
                            "config": {
                                "params": {
                                    "vectors": {"size": 128, "distance": "Cosine"}
                                }
                            }
                        }
                    },
                )
            return httpx2.Response(
                200,
                json={
                    "result": [
                        {
                            "id": "pt-1",
                            "score": 0.91,
                            "payload": {
                                "business_id": str(biz_id),
                                "document_id": str(doc_id),
                                "document_version_id": str(ver_id),
                                "chunk_id": str(chunk_id),
                            },
                        },
                        {
                            "id": "pt-2",
                            "score": 0.85,
                            "payload": {
                                "business_id": str(biz_id),
                                "document_id": str(doc_id),
                                "document_version_id": str(ver_id),
                                "chunk_id": str(stale_chunk_id),
                            },
                        },
                    ]
                },
            )

        def backend_handler(request: httpx2.Request) -> httpx2.Response:
            body = json.loads(request.content.decode("utf-8"))
            self.assertEqual(body["businessId"], str(biz_id))
            self.assertEqual(len(body["candidates"]), 2)
            # Backend filters out stale_chunk_id
            return httpx2.Response(
                200,
                json={
                    "results": [
                        {
                            "chunkId": str(chunk_id),
                            "documentId": str(doc_id),
                            "documentVersionId": str(ver_id),
                            "chunkIndex": 0,
                            "score": 0.91,
                            "chunkText": "Check-in starts at 2:00 PM.",
                            "title": "hotel",
                            "sourceFilename": "hotel.txt",
                            "sourceType": "txt",
                            "mimeType": "text/plain",
                            "versionNumber": 1,
                            "visibility": "public",
                            "locationId": None,
                            "chunkVersion": "chunk-v1",
                            "headingPath": [],
                            "charStart": 0,
                            "charEnd": 27,
                            "citation": {
                                "documentId": str(doc_id),
                                "documentVersionId": str(ver_id),
                                "chunkId": str(chunk_id),
                                "title": "hotel",
                                "sourceFilename": "hotel.txt",
                                "versionNumber": 1,
                                "headingPath": [],
                            },
                        }
                    ]
                },
            )

        res = await perform_scoped_retrieval(
            req,
            settings,
            qdrant_store=QdrantVectorStore(
                base_url=settings.qdrant_url,
                transport=httpx2.MockTransport(qdrant_handler),
            ),
            backend_transport=httpx2.MockTransport(backend_handler),
        )
        self.assertEqual(res.candidate_count, 2)
        self.assertEqual(len(res.results), 1)
        self.assertEqual(res.results[0].chunk_id, str(chunk_id))
        self.assertEqual(res.results[0].citation.source_filename, "hotel.txt")

    def test_internal_retrieve_route_requires_ai_retrieve_scope(self) -> None:
        settings = make_settings()
        app = create_app(settings)
        client = TestClient(app)

        wrong_token = sign_worker_service_token(settings, scope="ai:respond")
        resp = client.post(
            "/api/v1/internal/retrieve",
            headers={"Authorization": f"Bearer {wrong_token}"},
            json={
                "requestId": "req-12345678",
                "businessId": str(uuid.uuid4()),
                "allowedKnowledgeScopes": ["public"],
                "query": "check in",
                "deadlineAtMs": int(time.time() * 1000) + 5000,
            },
        )
        self.assertIn(resp.status_code, (401, 403))


class LiveQdrantRetrievalTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_qdrant_scoped_search_isolation_visibility_and_location(self) -> None:
        qdrant_url = os.environ.get("AI_QDRANT_URL", "http://127.0.0.1:6333")
        async with httpx2.AsyncClient(timeout=2.0) as probe:
            try:
                ready = await probe.get(f"{qdrant_url}/readyz")
                if ready.status_code != 200:
                    self.skipTest("Qdrant is not ready.")
            except httpx2.HTTPError:
                self.skipTest("Qdrant is not reachable.")

        prefix = f"onussync_ret_it_{uuid.uuid4().hex[:8]}"
        collection = build_versioned_collection_name(prefix, "embed-v1", 128)
        store = QdrantVectorStore(base_url=qdrant_url)
        adapter = MockEmbeddingAdapter(dimensions=128)

        tenant_a = str(uuid.uuid4())
        tenant_b = str(uuid.uuid4())
        loc_1 = str(uuid.uuid4())
        loc_2 = str(uuid.uuid4())

        try:
            async def seed_doc(biz: str, vis: str, loc: str | None, text: str) -> None:
                ver_id = str(uuid.uuid4())
                job = LeasedJobRecord(
                    id=str(uuid.uuid4()),
                    businessId=biz,
                    documentId=str(uuid.uuid4()),
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
                    visibility=vis,  # type: ignore[arg-type]
                    locationId=loc,
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

            await seed_doc(tenant_a, "public", loc_1, "Alpha Loc1 Public Check-in")
            await seed_doc(tenant_a, "staff_only", loc_1, "Alpha Loc1 Staff Secret")
            await seed_doc(tenant_a, "public", loc_2, "Alpha Loc2 Public Pool")
            await seed_doc(tenant_a, "public", None, "Alpha Business-Wide FAQ")
            await seed_doc(tenant_b, "public", None, "Beta Tenant Public FAQ")

            qvec = await adapter.embed_query("Alpha Loc1 Public Check-in")

            # 1. Tenant A, public only, loc_1 + business-wide -> should return 2 docs (loc_1 public + business-wide)
            req1 = AiRetrieveRequest(
                requestId="req-12345678",
                businessId=uuid.UUID(tenant_a),
                allowedKnowledgeScopes=["public"],
                locationIds=[uuid.UUID(loc_1)],
                includeBusinessWide=True,
                query="Alpha Loc1 Public Check-in",
                deadlineAtMs=int(time.time() * 1000) + 5000,
            )
            hits1 = await store.search_points(
                collection,
                qvec,
                filter_body=build_qdrant_search_filter(
                    req1, embedding_model_version="embed-v1"
                ),
                limit=10,
                score_threshold=None,
            )
            texts1 = {h.payload["chunk_text"] for h in hits1}
            self.assertEqual(
                texts1, {"Alpha Loc1 Public Check-in", "Alpha Business-Wide FAQ"}
            )

            # 2. Strict loc_1 only (includeBusinessWide=False), public + staff_only
            req2 = AiRetrieveRequest(
                requestId="req-12345678",
                businessId=uuid.UUID(tenant_a),
                allowedKnowledgeScopes=["public", "staff_only"],
                locationIds=[uuid.UUID(loc_1)],
                includeBusinessWide=False,
                query="Alpha Loc1",
                deadlineAtMs=int(time.time() * 1000) + 5000,
            )
            hits2 = await store.search_points(
                collection,
                qvec,
                filter_body=build_qdrant_search_filter(
                    req2, embedding_model_version="embed-v1"
                ),
                limit=10,
                score_threshold=None,
            )
            texts2 = {h.payload["chunk_text"] for h in hits2}
            self.assertEqual(
                texts2, {"Alpha Loc1 Public Check-in", "Alpha Loc1 Staff Secret"}
            )
        finally:
            async with httpx2.AsyncClient(timeout=2.0) as cleanup:
                await cleanup.delete(f"{qdrant_url}/collections/{collection}")
