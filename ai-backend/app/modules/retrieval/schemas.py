"""Typed contracts for scoped semantic retrieval and PostgreSQL candidate validation."""

from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    field_validator,
)

from app.modules.respond.schemas import KnowledgeScope


class StrictRetrievalModel(BaseModel):
    """Base contract model forbidding unknown keys and serializing camelCase JSON."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
        str_strip_whitespace=True,
    )


class AiRetrieveRequest(StrictRetrievalModel):
    """Trusted backend-scoped semantic search request."""

    request_id: str = Field(alias="requestId", min_length=8, max_length=64)
    business_id: UUID = Field(alias="businessId")
    allowed_knowledge_scopes: list[KnowledgeScope] = Field(
        alias="allowedKnowledgeScopes", min_length=1, max_length=2
    )
    location_ids: list[UUID] | None = Field(
        default=None, alias="locationIds", max_length=50
    )
    include_business_wide: StrictBool = Field(
        default=True, alias="includeBusinessWide"
    )
    query: str = Field(min_length=1, max_length=2000)
    top_k: StrictInt | None = Field(default=None, alias="topK", ge=1, le=50)
    score_threshold: StrictFloat | StrictInt | None = Field(
        default=None, alias="scoreThreshold", ge=0.0, le=1.0
    )
    deadline_at_ms: StrictInt = Field(alias="deadlineAtMs", gt=0)

    @field_validator("query")
    @classmethod
    def validate_non_blank_query(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("query must not be blank.")
        return cleaned


class RetrievalCitation(StrictRetrievalModel):
    """Source citation metadata for a validated chunk."""

    document_id: str = Field(alias="documentId")
    document_version_id: str = Field(alias="documentVersionId")
    chunk_id: str = Field(alias="chunkId")
    title: str
    source_filename: str = Field(alias="sourceFilename")
    version_number: int = Field(alias="versionNumber")
    heading_path: list[str] = Field(alias="headingPath")


class ValidatedRetrievalResult(StrictRetrievalModel):
    """PostgreSQL-validated semantic search match."""

    chunk_id: str = Field(alias="chunkId")
    document_id: str = Field(alias="documentId")
    document_version_id: str = Field(alias="documentVersionId")
    chunk_index: int = Field(alias="chunkIndex")
    score: float
    chunk_text: str = Field(alias="chunkText")
    title: str
    source_filename: str = Field(alias="sourceFilename")
    source_type: Literal["txt", "markdown"] = Field(alias="sourceType")
    mime_type: Literal["text/plain", "text/markdown"] = Field(alias="mimeType")
    version_number: int = Field(alias="versionNumber")
    visibility: KnowledgeScope
    location_id: str | None = Field(alias="locationId")
    chunk_version: str = Field(alias="chunkVersion")
    heading_path: list[str] = Field(alias="headingPath")
    char_start: int = Field(alias="charStart")
    char_end: int = Field(alias="charEnd")
    citation: RetrievalCitation


class AiRetrieveResponse(StrictRetrievalModel):
    """Response returned by POST /api/v1/internal/retrieve."""

    request_id: str = Field(alias="requestId")
    embedding_model: str = Field(alias="embeddingModel")
    embedding_model_version: str = Field(alias="embeddingModelVersion")
    embedding_dimensions: int = Field(alias="embeddingDimensions")
    qdrant_collection: str = Field(alias="qdrantCollection")
    candidate_count: int = Field(alias="candidateCount")
    results: list[ValidatedRetrievalResult]

