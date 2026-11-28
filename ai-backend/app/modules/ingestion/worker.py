"""Single-job ingestion worker loop step for Step 05.02."""

import hashlib
from collections.abc import Awaitable, Callable

from app.modules.ingestion.chunker import ChunkedDocumentResult, chunk_document_text
from app.modules.ingestion.client import BackendIngestionClient
from app.modules.ingestion.schemas import (
    IngestionWorkerResult,
    LeasedDocumentPayload,
    LeasedJobRecord,
)


class NonRetryableIngestionError(RuntimeError):
    """Raised when a leased payload fails integrity checks and should not be retried."""


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


async def process_next_ingestion_job(
    client: BackendIngestionClient,
    *,
    worker_id: str,
    lease_duration_seconds: int = 60,
    processor: JobProcessor | None = None,
) -> IngestionWorkerResult | None:
    """Lease one job, validate integrity, normalize/chunk text, and report completion or failure."""
    leased = await client.lease_next_job(
        worker_id=worker_id,
        lease_duration_seconds=lease_duration_seconds,
    )
    if leased.job is None or leased.document is None:
        return None

    job = leased.job
    if not job.leaseToken:
        raise RuntimeError("Leased job response is missing leaseToken.")

    try:
        verify_leased_document_integrity(leased.document)
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

    completed = await client.complete_job(
        job_id=job.id,
        lease_token=job.leaseToken,
        business_id=job.businessId,
        document_version_id=job.documentVersionId,
        chunking=chunking,
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
    )

