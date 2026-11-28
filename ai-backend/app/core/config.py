"""Validated configuration for the AI service."""

import re
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIRECTORY = Path(__file__).resolve().parents[2]
MIN_INTERNAL_AUTH_SECRET_LENGTH = 32
MIN_GEMINI_API_KEY_LENGTH = 10
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_EMBEDDING_DIMENSIONS = 768
DEFAULT_EMBEDDING_MODEL_VERSION = "embed-v1"
MODEL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
COLLECTION_PREFIX_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


def _validate_http_origin(value: str, env_name: str) -> str:
    """Accept only HTTP(S) origins without credentials, paths, queries, or fragments."""
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(
            f"{env_name} must be an HTTP(S) origin without credentials, paths, queries, or fragments."
        )
    return f"{parsed.scheme}://{parsed.netloc}"


class Settings(BaseSettings):
    """Read AI_ environment variables, with the service's .env as a fallback."""

    model_config = SettingsConfigDict(
        env_prefix="AI_",
        env_file=SERVICE_DIRECTORY / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        str_strip_whitespace=True,
        hide_input_in_errors=True,
    )

    app_name: str = Field(default="OnusSync AI Service", min_length=1)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    internal_auth_secret: SecretStr
    internal_auth_issuer: str = Field(
        default="onussync-backend", min_length=1, max_length=100
    )
    internal_auth_audience: str = Field(
        default="onussync-ai-backend", min_length=1, max_length=100
    )
    internal_auth_max_ttl_seconds: int = Field(default=300, ge=1, le=3600)
    internal_auth_clock_skew_seconds: int = Field(default=0, ge=0, le=60)
    internal_max_request_bytes: int = Field(default=262_144, ge=1024, le=1_048_576)
    internal_max_deadline_ms: int = Field(default=60_000, ge=100, le=300_000)

    backend_service_url: str = Field(
        default="http://127.0.0.1:3000", min_length=1, max_length=300
    )
    backend_request_timeout_ms: int = Field(default=5000, ge=100, le=60_000)

    chunk_version: str = Field(default="chunk-v1", min_length=1, max_length=64)
    chunk_max_chars: int = Field(default=800, ge=100, le=4000)
    chunk_overlap_chars: int = Field(default=120, ge=0, le=1000)

    generation_mode: Literal["gemini", "mock"] = "gemini"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = Field(
        default=DEFAULT_GEMINI_MODEL, min_length=1, max_length=100
    )

    embedding_model: str = Field(
        default=DEFAULT_EMBEDDING_MODEL, min_length=1, max_length=100
    )
    embedding_dimensions: int = Field(
        default=DEFAULT_EMBEDDING_DIMENSIONS, ge=128, le=3072
    )
    embedding_model_version: str = Field(
        default=DEFAULT_EMBEDDING_MODEL_VERSION, min_length=1, max_length=64
    )
    embedding_batch_size: int = Field(default=32, ge=1, le=100)
    embedding_max_retries: int = Field(default=3, ge=0, le=5)
    embedding_retry_base_delay_ms: int = Field(default=250, ge=10, le=10_000)

    qdrant_url: str = Field(
        default="http://127.0.0.1:6333", min_length=1, max_length=300
    )
    qdrant_api_key: SecretStr | None = None
    qdrant_collection_prefix: str = Field(
        default="onussync_chunks", min_length=1, max_length=64
    )
    qdrant_request_timeout_ms: int = Field(default=5000, ge=100, le=60_000)

    retrieval_default_top_k: int = Field(default=5, ge=1, le=20)
    retrieval_max_top_k: int = Field(default=20, ge=1, le=50)
    retrieval_default_score_threshold: float = Field(default=0.35, ge=0.0, le=1.0)

    rag_enabled: bool = True
    rag_max_context_chunks: int = Field(default=5, ge=1, le=20)
    rag_max_context_chars: int = Field(default=6000, ge=500, le=32_000)
    rag_max_history_messages: int = Field(default=10, ge=0, le=20)
    rag_max_output_tokens: int = Field(default=1024, ge=64, le=2048)

    @field_validator("internal_auth_secret", mode="before")
    @classmethod
    def validate_internal_auth_secret(cls, value: object) -> object:
        """Require a non-whitespace-padded secret of at least 32 characters."""
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if (
            not isinstance(raw, str)
            or len(raw) < MIN_INTERNAL_AUTH_SECRET_LENGTH
            or raw != raw.strip()
        ):
            raise ValueError(
                "AI_INTERNAL_AUTH_SECRET must be at least 32 characters without surrounding whitespace."
            )
        return value

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def validate_gemini_api_key(cls, value: object) -> object:
        """Reject empty or whitespace-padded Gemini API keys when supplied."""
        if value is None:
            return None
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if (
            not isinstance(raw, str)
            or len(raw) < MIN_GEMINI_API_KEY_LENGTH
            or raw != raw.strip()
        ):
            raise ValueError(
                "AI_GEMINI_API_KEY must be at least 10 characters without surrounding whitespace."
            )
        return value

    @field_validator("backend_service_url")
    @classmethod
    def validate_backend_service_url(cls, value: str) -> str:
        """Accept only HTTP(S) origins without credentials, paths, queries, or fragments."""
        return _validate_http_origin(value, "AI_BACKEND_SERVICE_URL")

    @field_validator("qdrant_url")
    @classmethod
    def validate_qdrant_url(cls, value: str) -> str:
        """Accept only HTTP(S) origins without credentials, paths, queries, or fragments."""
        return _validate_http_origin(value, "AI_QDRANT_URL")

    @field_validator("gemini_model")
    @classmethod
    def validate_gemini_model(cls, value: str) -> str:
        """Accept only safe model identifiers without paths or query strings."""
        if not MODEL_NAME_PATTERN.match(value):
            raise ValueError(
                "AI_GEMINI_MODEL must contain only letters, digits, dots, underscores, or hyphens."
            )
        return value

    @field_validator("embedding_model")
    @classmethod
    def validate_embedding_model(cls, value: str) -> str:
        """Accept only safe embedding model identifiers."""
        if not MODEL_NAME_PATTERN.match(value):
            raise ValueError(
                "AI_EMBEDDING_MODEL must contain only letters, digits, dots, underscores, or hyphens."
            )
        return value

    @field_validator("embedding_model_version")
    @classmethod
    def validate_embedding_model_version(cls, value: str) -> str:
        """Accept only safe embedding version identifiers."""
        if not MODEL_NAME_PATTERN.match(value):
            raise ValueError(
                "AI_EMBEDDING_MODEL_VERSION must contain only letters, digits, dots, underscores, or hyphens."
            )
        return value

    @field_validator("qdrant_collection_prefix")
    @classmethod
    def validate_qdrant_collection_prefix(cls, value: str) -> str:
        """Accept only safe Qdrant collection name prefixes."""
        if not COLLECTION_PREFIX_PATTERN.match(value):
            raise ValueError(
                "AI_QDRANT_COLLECTION_PREFIX must contain only letters, digits, underscores, or hyphens."
            )
        return value

    @field_validator("qdrant_api_key", mode="before")
    @classmethod
    def validate_qdrant_api_key(cls, value: object) -> object:
        """Reject empty or whitespace-padded Qdrant API keys when supplied."""
        if value is None:
            return None
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if not isinstance(raw, str) or len(raw) < 1 or raw != raw.strip():
            raise ValueError(
                "AI_QDRANT_API_KEY must be a non-empty string without surrounding whitespace."
            )
        return value

    @field_validator("chunk_version")
    @classmethod
    def validate_chunk_version(cls, value: str) -> str:
        """Accept only safe chunker version identifiers."""
        if not MODEL_NAME_PATTERN.match(value):
            raise ValueError(
                "AI_CHUNK_VERSION must contain only letters, digits, dots, underscores, or hyphens."
            )
        return value

    @model_validator(mode="after")
    def validate_chunk_overlap_bounds(self) -> "Settings":
        """Ensure chunk overlap is strictly smaller than chunk max size."""
        if self.chunk_overlap_chars >= self.chunk_max_chars:
            raise ValueError(
                "AI_CHUNK_OVERLAP_CHARS must be smaller than AI_CHUNK_MAX_CHARS."
            )
        if self.retrieval_default_top_k > self.retrieval_max_top_k:
            raise ValueError(
                "AI_RETRIEVAL_DEFAULT_TOP_K must be <= AI_RETRIEVAL_MAX_TOP_K."
            )
        return self

    @model_validator(mode="after")
    def require_gemini_key_in_gemini_mode(self) -> "Settings":
        """Fail fast at startup when live Gemini mode is enabled without an API key."""
        if self.generation_mode == "gemini" and self.gemini_api_key is None:
            raise ValueError(
                "AI_GEMINI_API_KEY is required when AI_GENERATION_MODE is gemini."
            )
        return self
