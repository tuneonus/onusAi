"""Validated configuration for the AI service."""

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIRECTORY = Path(__file__).resolve().parents[2]


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
