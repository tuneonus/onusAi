"""Typed contracts for Node.js-to-Python document ingestion job callbacks."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictIngestionModel(BaseModel):
    """Base model rejecting unexpected fields from internal responses."""

    model_config = ConfigDict(extra="forbid")


class LeasedJobRecord(StrictIngestionModel):
    """Leased job metadata returned by Node.js."""

    id: str = Field(min_length=1)
    businessId: str = Field(min_length=1)
    documentId: str = Field(min_length=1)
    documentVersionId: str = Field(min_length=1)
    status: Literal["queued", "leased", "completed", "failed", "cancelled"]
    attemptCount: int = Field(ge=1)
    maxAttempts: int = Field(ge=1)
    nextAttemptAt: str
    leaseToken: str | None = None
    leasedBy: str | None = None
    leasedAt: str | None = None
    leaseExpiresAt: str | None = None
    lastError: str | None = None
    completedAt: str | None = None
    createdAt: str
    updatedAt: str


class LeasedDocumentPayload(StrictIngestionModel):
    """Bounded document version text and metadata leased for processing."""

    versionNumber: int = Field(ge=1)
    visibility: Literal["public", "staff_only"]
    locationId: str | None = None
    sourceFilename: str = Field(min_length=1)
    mimeType: Literal["text/plain", "text/markdown"]
    sourceType: Literal["txt", "markdown"]
    byteSize: int = Field(ge=1)
    charCount: int = Field(ge=1)
    contentSha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    contentText: str = Field(min_length=1)


class LeaseJobResponse(StrictIngestionModel):
    """Response from POST /api/v1/internal/ingestion-jobs/lease."""

    job: LeasedJobRecord | None
    document: LeasedDocumentPayload | None = None


class JobMutationResponse(StrictIngestionModel):
    """Response from complete/fail job callbacks."""

    job: LeasedJobRecord


class IngestionWorkerResult(StrictIngestionModel):
    """Summary returned by one worker poll/process cycle."""

    jobId: str
    businessId: str
    documentVersionId: str
    outcome: Literal["completed", "failed"]
    jobStatus: str
    attemptCount: int
    chunkVersion: str | None = None
    chunkCount: int = 0

