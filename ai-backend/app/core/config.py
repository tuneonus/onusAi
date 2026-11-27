"""Validated configuration for the AI service."""

import re
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIRECTORY = Path(__file__).resolve().parents[2]
MIN_INTERNAL_AUTH_SECRET_LENGTH = 32
MIN_GEMINI_API_KEY_LENGTH = 10
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"
MODEL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


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

    app_name: str = Field(default="OnusAI AI Service", min_length=1)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    internal_auth_secret: SecretStr
    internal_auth_issuer: str = Field(
        default="onusai-backend", min_length=1, max_length=100
    )
    internal_auth_audience: str = Field(
        default="onusai-ai-backend", min_length=1, max_length=100
    )
    internal_auth_max_ttl_seconds: int = Field(default=300, ge=1, le=3600)
    internal_auth_clock_skew_seconds: int = Field(default=0, ge=0, le=60)
    internal_max_request_bytes: int = Field(default=262_144, ge=1024, le=1_048_576)
    internal_max_deadline_ms: int = Field(default=60_000, ge=100, le=300_000)

    generation_mode: Literal["gemini", "mock"] = "gemini"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = Field(
        default=DEFAULT_GEMINI_MODEL, min_length=1, max_length=100
    )

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

    @field_validator("gemini_model")
    @classmethod
    def validate_gemini_model(cls, value: str) -> str:
        """Accept only safe model identifiers without paths or query strings."""
        if not MODEL_NAME_PATTERN.match(value):
            raise ValueError(
                "AI_GEMINI_MODEL must contain only letters, digits, dots, underscores, or hyphens."
            )
        return value

    @model_validator(mode="after")
    def require_gemini_key_in_gemini_mode(self) -> "Settings":
        """Fail fast at startup when live Gemini mode is enabled without an API key."""
        if self.generation_mode == "gemini" and self.gemini_api_key is None:
            raise ValueError(
                "AI_GEMINI_API_KEY is required when AI_GENERATION_MODE is gemini."
            )
        return self
