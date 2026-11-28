"""Asynchronous Google Gemini adapter using the official google-genai SDK."""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException
from google import genai
from google.genai import errors, types

logger = logging.getLogger(__name__)

MAX_ANSWER_LENGTH = 8000
BLOCKED_FINISH_REASONS = frozenset(
    {
        "SAFETY",
        "RECITATION",
        "PROHIBITED_CONTENT",
        "BLOCKLIST",
        "SPII",
        "MODEL_ARMOR",
        "IMAGE_SAFETY",
        "IMAGE_PROHIBITED_CONTENT",
        "IMAGE_RECITATION",
    }
)
ALLOWED_FINISH_REASONS = frozenset({"STOP", "MAX_TOKENS", "FINISH_REASON_UNSPECIFIED"})


@dataclass(frozen=True)
class GeminiGenerationResult:
    """Validated text, completion status, and token usage from Gemini."""

    text: str
    status: Literal["completed", "abstained"]
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int


def _enum_name(value: object) -> str | None:
    if value is None:
        return None
    name = getattr(value, "name", None)
    if isinstance(name, str):
        return name
    if isinstance(value, str):
        return value
    return str(value)


def _extract_usage(response: Any) -> tuple[int, int, int]:
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return 0, 0, 0

    raw_in = getattr(usage, "prompt_token_count", None)
    raw_out = getattr(usage, "candidates_token_count", None)
    raw_total = getattr(usage, "total_token_count", None)

    input_tokens = raw_in if isinstance(raw_in, int) and raw_in >= 0 else 0
    output_tokens = raw_out if isinstance(raw_out, int) and raw_out >= 0 else 0
    total_tokens = (
        raw_total
        if isinstance(raw_total, int) and raw_total >= 0
        else input_tokens + output_tokens
    )
    return input_tokens, output_tokens, total_tokens


def _extract_candidate_text(response: Any, candidate: Any) -> str:
    direct_text = getattr(response, "text", None)
    if isinstance(direct_text, str) and direct_text.strip():
        return direct_text.strip()[:MAX_ANSWER_LENGTH]

    content = getattr(candidate, "content", None)
    parts = getattr(content, "parts", None) or []
    text_parts = [
        part.text
        for part in parts
        if isinstance(getattr(part, "text", None), str) and part.text
    ]
    combined = "".join(text_parts).strip()
    return combined[:MAX_ANSWER_LENGTH]


class GeminiAdapter:
    """Thin async wrapper around google.genai.Client with safe errors and usage capture."""

    def __init__(
        self,
        *,
        api_key: str,
        default_model: str,
        client: Any | None = None,
    ) -> None:
        self._default_model = default_model
        self._client = client if client is not None else genai.Client(api_key=api_key)

    async def generate(
        self,
        *,
        system_instruction: str,
        contents: list[types.Content],
        temperature: float,
        max_output_tokens: int,
        fallback_message: str,
        model: str | None = None,
        response_mime_type: str | None = None,
    ) -> GeminiGenerationResult:
        """Generate a single response asynchronously and map provider failures safely."""
        target_model = model or self._default_model
        config_kwargs: dict[str, Any] = {
            "system_instruction": system_instruction,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }
        if response_mime_type is not None:
            config_kwargs["response_mime_type"] = response_mime_type
        config = types.GenerateContentConfig(**config_kwargs)

        try:
            response = await self._client.aio.models.generate_content(
                model=target_model,
                contents=contents,
                config=config,
            )
        except (TimeoutError, asyncio.CancelledError):
            raise
        except errors.APIError as exc:
            status_code = getattr(exc, "code", None)
            if status_code == 429:
                logger.warning("Gemini API rate limit reached.")
                raise HTTPException(
                    status_code=429,
                    detail="AI provider rate limit exceeded.",
                ) from exc
            if status_code in (408, 504):
                logger.warning("Gemini API request timed out (status=%s).", status_code)
                raise HTTPException(
                    status_code=504,
                    detail="AI provider request timed out.",
                ) from exc
            if status_code in (401, 403):
                logger.error(
                    "Gemini API rejected credentials or permissions (status=%s).",
                    status_code,
                )
            else:
                logger.error("Gemini API error (status=%s).", status_code)
            raise HTTPException(
                status_code=502,
                detail="AI provider request failed.",
            ) from exc
        except Exception as exc:
            # Never log exception messages or str(exc); they can carry request context or URLs.
            logger.error("Unexpected Gemini client failure: %s", type(exc).__name__)
            raise HTTPException(
                status_code=502,
                detail="AI provider request failed.",
            ) from exc

        input_tokens, output_tokens, total_tokens = _extract_usage(response)

        prompt_feedback = getattr(response, "prompt_feedback", None)
        block_reason = _enum_name(getattr(prompt_feedback, "block_reason", None))
        if block_reason and block_reason != "BLOCKED_REASON_UNSPECIFIED":
            logger.warning("Gemini prompt blocked (reason=%s).", block_reason)
            return GeminiGenerationResult(
                text=fallback_message[:MAX_ANSWER_LENGTH],
                status="abstained",
                model=target_model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
            )

        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            logger.warning("Gemini response contained no candidates.")
            raise HTTPException(
                status_code=502,
                detail="AI provider returned an invalid response.",
            )

        primary = candidates[0]
        finish_reason = _enum_name(getattr(primary, "finish_reason", None))

        if finish_reason in BLOCKED_FINISH_REASONS:
            logger.warning("Gemini candidate blocked (reason=%s).", finish_reason)
            return GeminiGenerationResult(
                text=fallback_message[:MAX_ANSWER_LENGTH],
                status="abstained",
                model=target_model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
            )

        if finish_reason is not None and finish_reason not in ALLOWED_FINISH_REASONS:
            logger.warning("Gemini unexpected finish reason (reason=%s).", finish_reason)
            raise HTTPException(
                status_code=502,
                detail="AI provider returned an invalid response.",
            )

        text = _extract_candidate_text(response, primary)
        if not text:
            logger.warning("Gemini response contained empty output text.")
            raise HTTPException(
                status_code=502,
                detail="AI provider returned an invalid response.",
            )

        return GeminiGenerationResult(
            text=text,
            status="completed",
            model=target_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )

    async def aclose(self) -> None:
        """Close the async SDK transport cleanly on application shutdown."""
        aio_client = getattr(self._client, "aio", None)
        close_fn = getattr(aio_client, "aclose", None)
        if callable(close_fn):
            await close_fn()

