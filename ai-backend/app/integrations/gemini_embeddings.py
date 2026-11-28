"""Asynchronous Google Gemini embedding adapter with batching, retries, and mock mode."""

import asyncio
import hashlib
import logging
import math
import struct
from collections.abc import Sequence
from typing import Any, Protocol

from google import genai
from google.genai import errors, types

logger = logging.getLogger(__name__)

RETRYABLE_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})


class GeminiEmbeddingError(RuntimeError):
    """Raised when embedding generation fails, with retryability classification."""

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class EmbeddingAdapter(Protocol):
    """Protocol implemented by both live Gemini and deterministic mock embedding adapters."""

    @property
    def model(self) -> str: ...

    @property
    def model_version(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...

    async def embed_query(self, query: str) -> list[float]: ...

    async def aclose(self) -> None: ...


class GeminiEmbeddingAdapter:
    """Async wrapper around google.genai.Client.aio.models.embed_content."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gemini-embedding-001",
        model_version: str = "embed-v1",
        dimensions: int = 768,
        batch_size: int = 32,
        max_retries: int = 3,
        retry_base_delay_ms: int = 250,
        client: Any | None = None,
    ) -> None:
        if dimensions < 128 or dimensions > 3072:
            raise ValueError("Embedding dimensions must be between 128 and 3072.")
        if batch_size < 1:
            raise ValueError("Embedding batch size must be at least 1.")

        self._model = model
        self._model_version = model_version
        self._dimensions = dimensions
        self._batch_size = batch_size
        self._max_retries = max_retries
        self._retry_base_delay_seconds = retry_base_delay_ms / 1000.0
        self._client = client if client is not None else genai.Client(api_key=api_key)

    @property
    def model(self) -> str:
        return self._model

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def _embed_batch_once(
        self, batch: list[str], *, task_type: str
    ) -> list[list[float]]:
        config = types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=self._dimensions,
        )
        try:
            response = await self._client.aio.models.embed_content(
                model=self._model,
                contents=batch,
                config=config,
            )
        except asyncio.CancelledError:
            raise
        except TimeoutError as exc:
            raise GeminiEmbeddingError(
                "Gemini embedding request timed out.", retryable=True
            ) from exc
        except errors.APIError as exc:
            status_code = getattr(exc, "code", None)
            retryable = status_code in RETRYABLE_STATUS_CODES
            logger.warning(
                "Gemini embedding API error (status=%s, retryable=%s).",
                status_code,
                retryable,
            )
            raise GeminiEmbeddingError(
                f"Gemini embedding API failed (status={status_code}).",
                retryable=retryable,
            ) from exc
        except Exception as exc:
            logger.error(
                "Unexpected Gemini embedding failure: %s", type(exc).__name__
            )
            raise GeminiEmbeddingError(
                f"Unexpected embedding failure ({type(exc).__name__}).",
                retryable=True,
            ) from exc

        embeddings = getattr(response, "embeddings", None)
        if not isinstance(embeddings, Sequence) or len(embeddings) != len(batch):
            raise GeminiEmbeddingError(
                "Gemini embedding response count did not match batch size.",
                retryable=False,
            )

        vectors: list[list[float]] = []
        for item in embeddings:
            raw_values = getattr(item, "values", None)
            if not isinstance(raw_values, Sequence) or len(raw_values) != self._dimensions:
                actual_dim = len(raw_values) if isinstance(raw_values, Sequence) else 0
                raise GeminiEmbeddingError(
                    f"Embedding dimension mismatch: expected {self._dimensions}, got {actual_dim}.",
                    retryable=False,
                )
            vector = [float(v) for v in raw_values]
            if any(not math.isfinite(v) for v in vector):
                raise GeminiEmbeddingError(
                    "Embedding response contained non-finite float values.",
                    retryable=False,
                )
            vectors.append(vector)

        return vectors

    async def _embed_with_retries(
        self, batch: list[str], *, task_type: str
    ) -> list[list[float]]:
        attempt = 0
        while True:
            try:
                return await self._embed_batch_once(batch, task_type=task_type)
            except GeminiEmbeddingError as exc:
                if not exc.retryable or attempt >= self._max_retries:
                    raise
                delay = self._retry_base_delay_seconds * (2**attempt)
                attempt += 1
                logger.info(
                    "Retrying Gemini embedding batch (attempt=%s/%s).",
                    attempt,
                    self._max_retries,
                )
                await asyncio.sleep(delay)

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Generate document embeddings in bounded batches with exponential-backoff retries."""
        if not texts:
            return []

        all_vectors: list[list[float]] = []
        text_list = list(texts)
        for start in range(0, len(text_list), self._batch_size):
            batch = text_list[start : start + self._batch_size]
            all_vectors.extend(
                await self._embed_with_retries(batch, task_type="RETRIEVAL_DOCUMENT")
            )

        return all_vectors

    async def embed_query(self, query: str) -> list[float]:
        """Generate a single query embedding using RETRIEVAL_QUERY task type."""
        cleaned = query.strip()
        if not cleaned:
            raise GeminiEmbeddingError("Query text must not be empty.", retryable=False)
        vectors = await self._embed_with_retries([cleaned], task_type="RETRIEVAL_QUERY")
        return vectors[0]

    async def aclose(self) -> None:
        """Close the async SDK transport cleanly."""
        aio_client = getattr(self._client, "aio", None)
        close_fn = getattr(aio_client, "aclose", None)
        if callable(close_fn):
            await close_fn()


class MockEmbeddingAdapter:
    """Deterministic offline embedding generator for unit and local integration tests."""

    def __init__(
        self,
        *,
        model: str = "gemini-embedding-001",
        model_version: str = "embed-v1",
        dimensions: int = 768,
    ) -> None:
        self._model = model
        self._model_version = model_version
        self._dimensions = dimensions

    @property
    def model(self) -> str:
        return self._model

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def _vector_for_text(self, text: str) -> list[float]:
        values: list[float] = []
        counter = 0
        while len(values) < self._dimensions:
            digest = hashlib.sha256(
                f"{self._model}:{self._model_version}:{counter}:{text}".encode("utf-8")
            ).digest()
            for offset in range(0, len(digest), 4):
                if len(values) >= self._dimensions:
                    break
                (raw_int,) = struct.unpack(">I", digest[offset : offset + 4])
                values.append((raw_int / 4294967295.0) * 2.0 - 1.0)
            counter += 1

        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return [v / norm for v in values]

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._vector_for_text(text) for text in texts]

    async def embed_query(self, query: str) -> list[float]:
        cleaned = query.strip()
        if not cleaned:
            raise GeminiEmbeddingError("Query text must not be empty.", retryable=False)
        return self._vector_for_text(cleaned)

    async def aclose(self) -> None:
        return None

