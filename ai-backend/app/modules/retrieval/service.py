"""Scoped semantic retrieval service: query embedding, Qdrant search, and Node.js PostgreSQL validation."""

import logging
import uuid
from typing import Any

import httpx2
from fastapi import HTTPException

from app.core.config import Settings
from app.core.internal_auth import sign_worker_service_token
from app.integrations.gemini_embeddings import EmbeddingAdapter, GeminiEmbeddingError
from app.integrations.qdrant_client import (
    QdrantError,
    QdrantSearchHit,
    QdrantVectorStore,
    build_versioned_collection_name,
)
from app.modules.ingestion.indexer import build_embedding_adapter, build_qdrant_store
from app.modules.retrieval.schemas import (
    AiRetrieveRequest,
    AiRetrieveResponse,
    ValidatedRetrievalResult,
)

logger = logging.getLogger(__name__)


def build_qdrant_search_filter(
    payload: AiRetrieveRequest,
    *,
    embedding_model_version: str,
) -> dict[str, Any]:
    """Build mandatory tenant, version, visibility, and location Qdrant filter."""
    must_clauses: list[dict[str, Any]] = [
        {"key": "business_id", "match": {"value": str(payload.business_id)}},
        {"key": "embedding_model_version", "match": {"value": embedding_model_version}},
        {
            "key": "visibility",
            "match": {"any": list(dict.fromkeys(payload.allowed_knowledge_scopes))},
        },
    ]

    if payload.location_ids is not None:
        loc_strings = [str(loc) for loc in dict.fromkeys(payload.location_ids)]
        if not loc_strings:
            if payload.include_business_wide:
                must_clauses.append({"is_null": {"key": "location_id"}})
            else:
                # Impossible filter so no location-scoped hits match when allowed list is empty.
                must_clauses.append({"key": "location_id", "match": {"any": []}})
        elif payload.include_business_wide:
            must_clauses.append(
                {
                    "should": [
                        {"key": "location_id", "match": {"any": loc_strings}},
                        {"is_null": {"key": "location_id"}},
                    ]
                }
            )
        else:
            must_clauses.append({"key": "location_id", "match": {"any": loc_strings}})
    elif not payload.include_business_wide:
        must_clauses.append({"is_empty": {"key": "location_id"}})
        # Note: above would match empty; we want non-null location_id when include_business_wide=False:
        must_clauses.pop()
        must_clauses.append({"must_not": [{"is_null": {"key": "location_id"}}]})

    return {"must": must_clauses}


async def _validate_candidates_with_backend(
    settings: Settings,
    payload: AiRetrieveRequest,
    hits: list[QdrantSearchHit],
    *,
    backend_transport: httpx2.AsyncBaseTransport | None = None,
) -> list[ValidatedRetrievalResult]:
    """Validate Qdrant candidates against authoritative PostgreSQL state via Node.js."""
    candidates: list[dict[str, object]] = []
    for hit in hits:
        doc_id = hit.payload.get("document_id")
        ver_id = hit.payload.get("document_version_id")
        chunk_id = hit.payload.get("chunk_id")
        if (
            isinstance(doc_id, str)
            and isinstance(ver_id, str)
            and isinstance(chunk_id, str)
        ):
            candidates.append(
                {
                    "documentId": doc_id,
                    "documentVersionId": ver_id,
                    "chunkId": chunk_id,
                    "score": hit.score,
                }
            )

    if not candidates:
        return []

    token = sign_worker_service_token(settings, scope="retrieval:validate")
    url = f"{settings.backend_service_url}/api/v1/internal/retrieval/validate"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Request-Id": payload.request_id or str(uuid.uuid4()),
    }
    body = {
        "businessId": str(payload.business_id),
        "allowedVisibilities": list(dict.fromkeys(payload.allowed_knowledge_scopes)),
        "allowedLocationIds": (
            [str(loc) for loc in dict.fromkeys(payload.location_ids)]
            if payload.location_ids is not None
            else None
        ),
        "includeBusinessWide": payload.include_business_wide,
        "candidates": candidates,
    }
    timeout_seconds = settings.backend_request_timeout_ms / 1000.0

    async with httpx2.AsyncClient(
        timeout=timeout_seconds,
        transport=backend_transport,
        follow_redirects=False,
    ) as client:
        try:
            response = await client.post(url, json=body, headers=headers)
        except httpx2.HTTPError as exc:
            logger.error(
                "Backend candidate validation request failed: %s", type(exc).__name__
            )
            raise HTTPException(
                status_code=503,
                detail="Authoritative candidate validation service is unavailable.",
            ) from exc

    if response.status_code != 200:
        logger.error(
            "Backend candidate validation returned HTTP %s.", response.status_code
        )
        raise HTTPException(
            status_code=502,
            detail="Authoritative candidate validation failed.",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Authoritative candidate validation returned invalid JSON.",
        ) from exc

    raw_results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(raw_results, list):
        raise HTTPException(
            status_code=502,
            detail="Authoritative candidate validation returned an invalid payload.",
        )

    return [ValidatedRetrievalResult.model_validate(item) for item in raw_results]


async def perform_scoped_retrieval(
    payload: AiRetrieveRequest,
    settings: Settings,
    *,
    embedding_adapter: EmbeddingAdapter | None = None,
    qdrant_store: QdrantVectorStore | None = None,
    backend_transport: httpx2.AsyncBaseTransport | None = None,
) -> AiRetrieveResponse:
    """Embed query with RETRIEVAL_QUERY, search versioned Qdrant, and validate against PostgreSQL."""
    top_k = (
        min(payload.top_k, settings.retrieval_max_top_k)
        if payload.top_k is not None
        else settings.retrieval_default_top_k
    )
    score_threshold = (
        float(payload.score_threshold)
        if payload.score_threshold is not None
        else settings.retrieval_default_score_threshold
    )

    owns_adapter = embedding_adapter is None
    active_adapter = (
        embedding_adapter
        if embedding_adapter is not None
        else build_embedding_adapter(settings)
    )
    active_qdrant = (
        qdrant_store if qdrant_store is not None else build_qdrant_store(settings)
    )

    collection_name = build_versioned_collection_name(
        settings.qdrant_collection_prefix,
        active_adapter.model_version,
        active_adapter.dimensions,
    )

    try:
        query_vector = await active_adapter.embed_query(payload.query)
    except GeminiEmbeddingError as exc:
        if not exc.retryable:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        raise HTTPException(
            status_code=502,
            detail="Query embedding provider request failed.",
        ) from exc
    finally:
        if owns_adapter:
            await active_adapter.aclose()

    search_filter = build_qdrant_search_filter(
        payload,
        embedding_model_version=active_adapter.model_version,
    )

    try:
        hits = await active_qdrant.search_points(
            collection_name,
            query_vector,
            filter_body=search_filter,
            limit=top_k,
            score_threshold=score_threshold,
        )
    except QdrantError as exc:
        status_code = 503 if exc.retryable else 500
        raise HTTPException(
            status_code=status_code,
            detail="Vector search service is unavailable."
            if exc.retryable
            else "Vector collection schema is incompatible.",
        ) from exc

    if not hits:
        return AiRetrieveResponse(
            requestId=payload.request_id,
            embeddingModel=active_adapter.model,
            embeddingModelVersion=active_adapter.model_version,
            embeddingDimensions=active_adapter.dimensions,
            qdrantCollection=collection_name,
            candidateCount=0,
            results=[],
        )

    validated = await _validate_candidates_with_backend(
        settings,
        payload,
        hits,
        backend_transport=backend_transport,
    )

    return AiRetrieveResponse(
        requestId=payload.request_id,
        embeddingModel=active_adapter.model,
        embeddingModelVersion=active_adapter.model_version,
        embeddingDimensions=active_adapter.dimensions,
        qdrantCollection=collection_name,
        candidateCount=len(hits),
        results=validated,
    )

