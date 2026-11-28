"""Async Qdrant REST client with versioned collection and payload index management."""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import httpx2

RETRYABLE_QDRANT_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
COLLECTION_SANITIZE_PATTERN = re.compile(r"[^A-Za-z0-9_-]")


class QdrantError(RuntimeError):
    """Raised when Qdrant operations fail or detect incompatible collection schema."""

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass(frozen=True)
class QdrantPoint:
    """Single point payload for Qdrant upsert."""

    id: str
    vector: list[float]
    payload: dict[str, Any]


@dataclass(frozen=True)
class QdrantSearchHit:
    """Single similarity search hit returned by Qdrant."""

    id: str
    score: float
    payload: dict[str, Any]


def build_versioned_collection_name(
    prefix: str,
    embedding_model_version: str,
    dimensions: int,
) -> str:
    """Derive a deterministic, versioned Qdrant collection name."""
    safe_prefix = COLLECTION_SANITIZE_PATTERN.sub("_", prefix)
    safe_version = COLLECTION_SANITIZE_PATTERN.sub("_", embedding_model_version)
    return f"{safe_prefix}__{safe_version}__d{dimensions}"


class QdrantVectorStore:
    """Thin async REST client for Qdrant using httpx2."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        timeout_ms: int = 5000,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout_seconds = timeout_ms / 1000.0
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self._api_key:
            headers["api-key"] = self._api_key
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        allowed_statuses: frozenset[int] = frozenset({200}),
    ) -> tuple[int, dict[str, Any]]:
        url = f"{self._base_url}{path}"
        async with httpx2.AsyncClient(
            timeout=self._timeout_seconds,
            transport=self._transport,
            follow_redirects=False,
        ) as client:
            try:
                response = await client.request(
                    method,
                    url,
                    json=json_body,
                    headers=self._headers(),
                )
            except httpx2.HTTPError as exc:
                raise QdrantError(
                    f"Qdrant request failed ({type(exc).__name__}).",
                    retryable=True,
                ) from exc

        if response.status_code not in allowed_statuses:
            retryable = response.status_code in RETRYABLE_QDRANT_STATUSES
            raise QdrantError(
                f"Qdrant returned HTTP {response.status_code} for {method} {path}.",
                retryable=retryable,
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise QdrantError("Qdrant returned invalid JSON.", retryable=False) from exc

        if not isinstance(data, dict):
            raise QdrantError("Qdrant returned an unexpected response.", retryable=False)

        return response.status_code, data

    async def ensure_collection(self, collection_name: str, vector_size: int) -> None:
        """Create the versioned collection if missing, or verify vector compatibility."""
        status_code, body = await self._request(
            "GET",
            f"/collections/{collection_name}",
            allowed_statuses=frozenset({200, 404}),
        )

        if status_code == 200:
            result = body.get("result") or {}
            config = result.get("config") or {}
            params = config.get("params") or {}
            vectors = params.get("vectors") or {}
            existing_size = vectors.get("size")
            existing_distance = vectors.get("distance")
            if existing_size != vector_size or existing_distance != "Cosine":
                raise QdrantError(
                    f"Qdrant collection '{collection_name}' has incompatible vector config "
                    f"(size={existing_size}, distance={existing_distance}; expected size={vector_size}, distance=Cosine).",
                    retryable=False,
                )
        else:
            await self._request(
                "PUT",
                f"/collections/{collection_name}",
                json_body={
                    "vectors": {
                        "size": vector_size,
                        "distance": "Cosine",
                    }
                },
            )

        index_specs: list[tuple[str, dict[str, Any] | str]] = [
            ("business_id", {"type": "keyword", "is_tenant": True}),
            ("document_id", "keyword"),
            ("document_version_id", "keyword"),
            ("location_id", "keyword"),
            ("visibility", "keyword"),
            ("chunk_version", "keyword"),
            ("embedding_model_version", "keyword"),
        ]
        for field_name, field_schema in index_specs:
            await self._request(
                "PUT",
                f"/collections/{collection_name}/index",
                json_body={
                    "field_name": field_name,
                    "field_schema": field_schema,
                },
            )

    async def upsert_points(
        self,
        collection_name: str,
        points: Sequence[QdrantPoint],
        *,
        batch_size: int = 64,
    ) -> None:
        """Idempotently upsert points into Qdrant in bounded batches."""
        if not points:
            return

        point_list = list(points)
        for start in range(0, len(point_list), batch_size):
            batch = point_list[start : start + batch_size]
            await self._request(
                "PUT",
                f"/collections/{collection_name}/points?wait=true",
                json_body={
                    "points": [
                        {
                            "id": point.id,
                            "vector": point.vector,
                            "payload": point.payload,
                        }
                        for point in batch
                    ]
                },
            )

    async def count_points(
        self,
        collection_name: str,
        filter_body: dict[str, Any],
    ) -> int:
        """Count matching points in Qdrant."""
        _, body = await self._request(
            "POST",
            f"/collections/{collection_name}/points/count",
            json_body={"filter": filter_body, "exact": True},
        )
        result = body.get("result") or {}
        count = result.get("count", 0)
        return int(count)

    async def scroll_points(
        self,
        collection_name: str,
        filter_body: dict[str, Any],
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Scroll matching points with payloads for inspection and verification."""
        _, body = await self._request(
            "POST",
            f"/collections/{collection_name}/points/scroll",
            json_body={
                "filter": filter_body,
                "limit": limit,
                "with_payload": True,
                "with_vector": False,
            },
        )
        result = body.get("result") or {}
        points = result.get("points") or []
        return list(points)

    async def search_points(
        self,
        collection_name: str,
        query_vector: Sequence[float],
        *,
        filter_body: dict[str, Any],
        limit: int,
        score_threshold: float | None = None,
    ) -> list[QdrantSearchHit]:
        """Search a versioned Qdrant collection with compatibility checks and mandatory filters."""
        status_code, info_body = await self._request(
            "GET",
            f"/collections/{collection_name}",
            allowed_statuses=frozenset({200, 404}),
        )
        if status_code == 404:
            return []

        result = info_body.get("result") or {}
        config = result.get("config") or {}
        params = config.get("params") or {}
        vectors = params.get("vectors") or {}
        existing_size = vectors.get("size")
        existing_distance = vectors.get("distance")
        if existing_size != len(query_vector) or existing_distance != "Cosine":
            raise QdrantError(
                f"Qdrant collection '{collection_name}' has incompatible vector config "
                f"(size={existing_size}, distance={existing_distance}; expected size={len(query_vector)}, distance=Cosine).",
                retryable=False,
            )

        search_body: dict[str, Any] = {
            "vector": list(query_vector),
            "filter": filter_body,
            "limit": limit,
            "with_payload": True,
            "with_vector": False,
        }
        if score_threshold is not None:
            search_body["score_threshold"] = score_threshold

        _, search_resp = await self._request(
            "POST",
            f"/collections/{collection_name}/points/search",
            json_body=search_body,
        )
        raw_hits = search_resp.get("result") or []
        hits: list[QdrantSearchHit] = []
        for item in raw_hits:
            if not isinstance(item, dict):
                continue
            hit_id = item.get("id")
            score = item.get("score")
            payload = item.get("payload")
            if (
                hit_id is not None
                and isinstance(score, (int, float))
                and isinstance(payload, dict)
            ):
                hits.append(
                    QdrantSearchHit(
                        id=str(hit_id),
                        score=float(score),
                        payload=payload,
                    )
                )
        return hits

    async def delete_points_by_filter(
        self,
        collection_name: str,
        *,
        filter_body: dict[str, Any],
    ) -> None:
        """Delete matching points idempotently; safe no-op if collection does not exist."""
        status_code, _ = await self._request(
            "POST",
            f"/collections/{collection_name}/points/delete?wait=true",
            json_body={"filter": filter_body},
            allowed_statuses=frozenset({200, 404}),
        )
        if status_code == 404:
            return

    async def set_payload_by_filter(
        self,
        collection_name: str,
        *,
        payload: dict[str, Any],
        filter_body: dict[str, Any],
    ) -> None:
        """Update payload fields on matching points idempotently; safe no-op if collection does not exist."""
        status_code, _ = await self._request(
            "POST",
            f"/collections/{collection_name}/points/payload?wait=true",
            json_body={"payload": payload, "filter": filter_body},
            allowed_statuses=frozenset({200, 404}),
        )
        if status_code == 404:
            return

