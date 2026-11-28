"""Versioned Qdrant vector indexing for normalized document chunks."""

import uuid
from dataclasses import dataclass

from app.core.config import Settings
from app.integrations.gemini_embeddings import (
    EmbeddingAdapter,
    GeminiEmbeddingAdapter,
    MockEmbeddingAdapter,
)
from app.integrations.qdrant_client import (
    QdrantPoint,
    QdrantVectorStore,
    build_versioned_collection_name,
)
from app.modules.ingestion.chunker import ChunkedDocumentResult
from app.modules.ingestion.schemas import LeasedDocumentPayload, LeasedJobRecord

VECTOR_ID_NAMESPACE = uuid.UUID("a3f9d4c0-7b2e-4c91-9e6b-1f2a3b4c5d6e")


@dataclass(frozen=True)
class VectorIndexResult:
    """Metadata recorded after successful Qdrant vector indexing."""

    embedding_model: str
    embedding_model_version: str
    embedding_dimensions: int
    qdrant_collection: str
    indexed_chunk_count: int


def build_deterministic_vector_id(
    *,
    chunk_id: str,
    embedding_model_version: str,
    embedding_dimensions: int,
) -> str:
    """Derive a deterministic UUIDv5 Qdrant point ID for idempotent upserts."""
    return str(
        uuid.uuid5(
            VECTOR_ID_NAMESPACE,
            f"{chunk_id}:{embedding_model_version}:{embedding_dimensions}",
        )
    )


def build_embedding_adapter(settings: Settings) -> EmbeddingAdapter:
    """Build the configured embedding adapter (live Gemini or deterministic mock)."""
    if settings.generation_mode == "mock" or settings.gemini_api_key is None:
        return MockEmbeddingAdapter(
            model=settings.embedding_model,
            model_version=settings.embedding_model_version,
            dimensions=settings.embedding_dimensions,
        )

    return GeminiEmbeddingAdapter(
        api_key=settings.gemini_api_key.get_secret_value(),
        model=settings.embedding_model,
        model_version=settings.embedding_model_version,
        dimensions=settings.embedding_dimensions,
        batch_size=settings.embedding_batch_size,
        max_retries=settings.embedding_max_retries,
        retry_base_delay_ms=settings.embedding_retry_base_delay_ms,
    )


def build_qdrant_store(settings: Settings) -> QdrantVectorStore:
    """Build the configured Qdrant REST store."""
    return QdrantVectorStore(
        base_url=settings.qdrant_url,
        api_key=(
            settings.qdrant_api_key.get_secret_value()
            if settings.qdrant_api_key is not None
            else None
        ),
        timeout_ms=settings.qdrant_request_timeout_ms,
    )


async def index_document_chunks(
    *,
    job: LeasedJobRecord,
    document: LeasedDocumentPayload,
    chunking: ChunkedDocumentResult,
    embedding_adapter: EmbeddingAdapter,
    qdrant_store: QdrantVectorStore,
    collection_prefix: str,
) -> VectorIndexResult:
    """Embed document chunks in batches and idempotently upsert them into a versioned Qdrant collection."""
    if not chunking.chunks:
        raise ValueError("Cannot index a document version with zero chunks.")

    collection_name = build_versioned_collection_name(
        collection_prefix,
        embedding_adapter.model_version,
        embedding_adapter.dimensions,
    )

    await qdrant_store.ensure_collection(
        collection_name,
        embedding_adapter.dimensions,
    )

    chunk_texts = [chunk.chunk_text for chunk in chunking.chunks]
    vectors = await embedding_adapter.embed_documents(chunk_texts)
    if len(vectors) != len(chunking.chunks):
        raise RuntimeError(
            "Embedding count does not match chunk count."
        )

    points: list[QdrantPoint] = []
    for chunk, vector in zip(chunking.chunks, vectors, strict=True):
        point_id = build_deterministic_vector_id(
            chunk_id=chunk.chunk_id,
            embedding_model_version=embedding_adapter.model_version,
            embedding_dimensions=embedding_adapter.dimensions,
        )
        payload = {
            "business_id": job.businessId,
            "document_id": job.documentId,
            "document_version_id": job.documentVersionId,
            "version_number": document.versionNumber,
            "location_id": document.locationId,
            "visibility": document.visibility,
            "source_filename": document.sourceFilename,
            "source_type": document.sourceType,
            "mime_type": document.mimeType,
            "chunk_id": chunk.chunk_id,
            "chunk_index": chunk.chunk_index,
            "chunk_version": chunking.chunk_version,
            "heading_path": chunk.heading_path,
            "char_start": chunk.char_start,
            "char_end": chunk.char_end,
            "char_count": chunk.char_count,
            "content_sha256": chunk.content_sha256,
            "chunk_text": chunk.chunk_text,
            "embedding_model": embedding_adapter.model,
            "embedding_model_version": embedding_adapter.model_version,
            "embedding_dimensions": embedding_adapter.dimensions,
        }
        points.append(QdrantPoint(id=point_id, vector=vector, payload=payload))

    await qdrant_store.upsert_points(collection_name, points)

    return VectorIndexResult(
        embedding_model=embedding_adapter.model,
        embedding_model_version=embedding_adapter.model_version,
        embedding_dimensions=embedding_adapter.dimensions,
        qdrant_collection=collection_name,
        indexed_chunk_count=len(points),
    )

