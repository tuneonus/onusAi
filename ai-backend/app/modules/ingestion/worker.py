"""Single-job ingestion worker loop step (chunking + embeddings + Qdrant indexing)."""

import hashlib
from collections.abc import Awaitable, Callable

from app.integrations.gemini_embeddings import EmbeddingAdapter, GeminiEmbeddingError
from app.integrations.qdrant_client import QdrantError, QdrantVectorStore
from app.modules.ingestion.chunker import (
    ChunkedDocumentResult,
    NormalizedChunk,
    chunk_document_text,
)
from app.modules.ingestion.client import BackendIngestionClient
from app.modules.ingestion.indexer import (
    VectorIndexResult,
    build_embedding_adapter,
    build_qdrant_store,
    index_document_chunks,
)
from app.modules.ingestion.schemas import (
    IngestionWorkerResult,
    LeasedDocumentPayload,
    LeasedJobRecord,
)


class NonRetryableIngestionError(RuntimeError):
    """Raised when a leased payload or provider config fails non-retryably."""


JobProcessor = Callable[
    [LeasedJobRecord, LeasedDocumentPayload, ChunkedDocumentResult],
    Awaitable[None],
]


def verify_leased_document_integrity(document: LeasedDocumentPayload) -> None:
    """Verify UTF-8 text integrity against the persisted SHA-256 digest."""
    actual_sha256 = hashlib.sha256(document.contentText.encode("utf-8")).hexdigest()
    if actual_sha256 != document.contentSha256:
        raise NonRetryableIngestionError(
            "Leased document content checksum does not match stored metadata."
        )


def _chunking_from_existing_chunks(
    client: BackendIngestionClient,
    document: LeasedDocumentPayload,
) -> ChunkedDocumentResult | None:
    if (
        not document.existingChunks
        or not document.existingChunkVersion
        or document.existingNormalizedCharCount is None
        or document.existingNormalizedSha256 is None
    ):
        return None

    chunks = [
        NormalizedChunk(
            chunk_id=item.chunkId,
            chunk_index=item.chunkIndex,
            heading_path=item.headingPath,
            char_start=item.charStart,
            char_end=item.charEnd,
            char_count=item.charCount,
            content_sha256=item.contentSha256,
            chunk_text=item.chunkText,
        )
        for item in document.existingChunks
    ]
    return ChunkedDocumentResult(
        chunk_version=document.existingChunkVersion,
        chunk_max_chars=client.settings.chunk_max_chars,
        chunk_overlap_chars=client.settings.chunk_overlap_chars,
        normalized_char_count=document.existingNormalizedCharCount,
        normalized_sha256=document.existingNormalizedSha256,
        chunks=chunks,
    )


async def process_next_ingestion_job(
    client: BackendIngestionClient,
    *,
    worker_id: str,
    lease_duration_seconds: int = 60,
    processor: JobProcessor | None = None,
    embedding_adapter: EmbeddingAdapter | None = None,
    qdrant_store: QdrantVectorStore | None = None,
) -> IngestionWorkerResult | None:
    """Lease one job, validate integrity, chunk (or reuse existing chunks), embed, index in Qdrant, and complete."""
    leased = await client.lease_next_job(
        worker_id=worker_id,
        lease_duration_seconds=lease_duration_seconds,
    )
    if leased.job is None or leased.document is None:
        return None

    job = leased.job
    if not job.leaseToken:
        raise RuntimeError("Leased job response is missing leaseToken.")

    owns_embedding_adapter = embedding_adapter is None
    active_embedding_adapter = (
        embedding_adapter
        if embedding_adapter is not None
        else build_embedding_adapter(client.settings)
    )
    active_qdrant_store = (
        qdrant_store
        if qdrant_store is not None
        else build_qdrant_store(client.settings)
    )

    try:
        verify_leased_document_integrity(leased.document)
        chunking = _chunking_from_existing_chunks(client, leased.document)
        if chunking is None:
            chunking = chunk_document_text(
                document_version_id=job.documentVersionId,
                source_type=leased.document.sourceType,
                raw_text=leased.document.contentText,
                chunk_version=client.settings.chunk_version,
                chunk_max_chars=client.settings.chunk_max_chars,
                chunk_overlap_chars=client.settings.chunk_overlap_chars,
            )

        if processor is not None:
            await processor(job, leased.document, chunking)

        index_result: VectorIndexResult = await index_document_chunks(
            job=job,
            document=leased.document,
            chunking=chunking,
            embedding_adapter=active_embedding_adapter,
            qdrant_store=active_qdrant_store,
            collection_prefix=client.settings.qdrant_collection_prefix,
        )
    except NonRetryableIngestionError as exc:
        failed = await client.fail_job(
            job_id=job.id,
            lease_token=job.leaseToken,
            business_id=job.businessId,
            document_version_id=job.documentVersionId,
            error_message=str(exc),
            retryable=False,
        )
        return IngestionWorkerResult(
            jobId=job.id,
            businessId=job.businessId,
            documentVersionId=job.documentVersionId,
            outcome="failed",
            jobStatus=failed.job.status,
            attemptCount=failed.job.attemptCount,
        )
    except (GeminiEmbeddingError, QdrantError) as exc:
        failed = await client.fail_job(
            job_id=job.id,
            lease_token=job.leaseToken,
            business_id=job.businessId,
            document_version_id=job.documentVersionId,
            error_message=str(exc) or "Vector indexing failed.",
            retryable=exc.retryable,
        )
        return IngestionWorkerResult(
            jobId=job.id,
            businessId=job.businessId,
            documentVersionId=job.documentVersionId,
            outcome="failed",
            jobStatus=failed.job.status,
            attemptCount=failed.job.attemptCount,
        )
    except Exception as exc:
        failed = await client.fail_job(
            job_id=job.id,
            lease_token=job.leaseToken,
            business_id=job.businessId,
            document_version_id=job.documentVersionId,
            error_message=str(exc) or "Document ingestion worker failed.",
            retryable=True,
        )
        return IngestionWorkerResult(
            jobId=job.id,
            businessId=job.businessId,
            documentVersionId=job.documentVersionId,
            outcome="failed",
            jobStatus=failed.job.status,
            attemptCount=failed.job.attemptCount,
        )
    finally:
        if owns_embedding_adapter:
            await active_embedding_adapter.aclose()

    completed = await client.complete_job(
        job_id=job.id,
        lease_token=job.leaseToken,
        business_id=job.businessId,
        document_version_id=job.documentVersionId,
        chunking=chunking,
        indexing=index_result,
    )
    return IngestionWorkerResult(
        jobId=job.id,
        businessId=job.businessId,
        documentVersionId=job.documentVersionId,
        outcome="completed",
        jobStatus=completed.job.status,
        attemptCount=completed.job.attemptCount,
        chunkVersion=chunking.chunk_version,
        chunkCount=len(chunking.chunks),
        embeddingModel=index_result.embedding_model,
        embeddingModelVersion=index_result.embedding_model_version,
        embeddingDimensions=index_result.embedding_dimensions,
        qdrantCollection=index_result.qdrant_collection,
        indexedChunkCount=index_result.indexed_chunk_count,
    )
