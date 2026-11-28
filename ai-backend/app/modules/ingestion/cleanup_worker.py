"""Durable Qdrant vector cleanup and metadata-sync worker loop step (Step 06.04)."""

from app.integrations.qdrant_client import (
    QdrantError,
    QdrantVectorStore,
    build_versioned_collection_name,
)
from app.modules.ingestion.client import BackendIngestionClient
from app.modules.ingestion.indexer import build_qdrant_store
from app.modules.ingestion.schemas import CleanupWorkerResult


async def process_next_cleanup_job(
    client: BackendIngestionClient,
    *,
    worker_id: str,
    lease_duration_seconds: int = 60,
    qdrant_store: QdrantVectorStore | None = None,
) -> CleanupWorkerResult | None:
    """Lease one vector cleanup/sync job, execute tenant-scoped Qdrant mutation, and report outcome."""
    leased = await client.lease_next_cleanup_job(
        worker_id=worker_id,
        lease_duration_seconds=lease_duration_seconds,
    )
    if leased.job is None:
        return None

    job = leased.job
    if not job.leaseToken:
        raise RuntimeError("Leased cleanup job is missing leaseToken.")

    active_qdrant = (
        qdrant_store
        if qdrant_store is not None
        else build_qdrant_store(client.settings)
    )
    collection_name = job.qdrantCollection or build_versioned_collection_name(
        client.settings.qdrant_collection_prefix,
        client.settings.embedding_model_version,
        client.settings.embedding_dimensions,
    )

    must_filters: list[dict[str, object]] = [
        {"key": "business_id", "match": {"value": job.businessId}},
        {"key": "document_id", "match": {"value": job.documentId}},
    ]
    if job.jobType == "delete_version":
        if not job.documentVersionId:
            failed = await client.fail_cleanup_job(
                job_id=job.id,
                lease_token=job.leaseToken,
                business_id=job.businessId,
                document_id=job.documentId,
                error_message="delete_version cleanup job is missing documentVersionId.",
                retryable=False,
            )
            return CleanupWorkerResult(
                jobId=job.id,
                businessId=job.businessId,
                documentId=job.documentId,
                jobType=job.jobType,
                outcome="failed",
                jobStatus=failed.job.status,
                attemptCount=failed.job.attemptCount,
            )
        must_filters.append(
            {"key": "document_version_id", "match": {"value": job.documentVersionId}}
        )

    tenant_filter = {"must": must_filters}

    try:
        if job.jobType in ("delete_document", "delete_version"):
            await active_qdrant.delete_points_by_filter(
                collection_name, filter_body=tenant_filter
            )
        elif job.jobType == "sync_metadata":
            payload_update: dict[str, object] = {}
            if "visibility" in job.payload:
                payload_update["visibility"] = job.payload["visibility"]
            if "locationId" in job.payload:
                payload_update["location_id"] = job.payload["locationId"]
            if payload_update:
                await active_qdrant.set_payload_by_filter(
                    collection_name,
                    payload=payload_update,
                    filter_body=tenant_filter,
                )
    except QdrantError as exc:
        failed = await client.fail_cleanup_job(
            job_id=job.id,
            lease_token=job.leaseToken,
            business_id=job.businessId,
            document_id=job.documentId,
            error_message=str(exc) or "Qdrant cleanup operation failed.",
            retryable=exc.retryable,
        )
        return CleanupWorkerResult(
            jobId=job.id,
            businessId=job.businessId,
            documentId=job.documentId,
            jobType=job.jobType,
            outcome="failed",
            jobStatus=failed.job.status,
            attemptCount=failed.job.attemptCount,
        )
    except Exception as exc:
        failed = await client.fail_cleanup_job(
            job_id=job.id,
            lease_token=job.leaseToken,
            business_id=job.businessId,
            document_id=job.documentId,
            error_message=str(exc) or "Unexpected cleanup worker failure.",
            retryable=True,
        )
        return CleanupWorkerResult(
            jobId=job.id,
            businessId=job.businessId,
            documentId=job.documentId,
            jobType=job.jobType,
            outcome="failed",
            jobStatus=failed.job.status,
            attemptCount=failed.job.attemptCount,
        )

    completed = await client.complete_cleanup_job(
        job_id=job.id,
        lease_token=job.leaseToken,
        business_id=job.businessId,
        document_id=job.documentId,
    )
    return CleanupWorkerResult(
        jobId=job.id,
        businessId=job.businessId,
        documentId=job.documentId,
        jobType=job.jobType,
        outcome="completed",
        jobStatus=completed.job.status,
        attemptCount=completed.job.attemptCount,
    )

