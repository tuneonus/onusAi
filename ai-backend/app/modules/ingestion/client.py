"""Authenticated HTTP client for Node.js internal ingestion job APIs."""

import uuid

import httpx2

from app.core.config import Settings
from app.core.internal_auth import sign_worker_service_token
from app.modules.ingestion.chunker import ChunkedDocumentResult
from app.modules.ingestion.schemas import JobMutationResponse, LeaseJobResponse


class IngestionClientError(RuntimeError):
    """Raised when the Node.js ingestion job API returns an error or invalid response."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class BackendIngestionClient:
    """Async client calling Node.js /api/v1/internal/ingestion-jobs endpoints."""

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._timeout_seconds = settings.backend_request_timeout_ms / 1000.0
        self._transport = transport

    @property
    def settings(self) -> Settings:
        return self._settings

    def _build_headers(self, request_id: str | None = None) -> dict[str, str]:
        token = sign_worker_service_token(self._settings, scope="ingestion:worker")
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Request-Id": request_id or str(uuid.uuid4()),
        }

    async def _post_json(
        self,
        path: str,
        payload: dict[str, object],
        *,
        request_id: str | None = None,
    ) -> dict[str, object]:
        url = f"{self._settings.backend_service_url}{path}"
        headers = self._build_headers(request_id)

        async with httpx2.AsyncClient(
            timeout=self._timeout_seconds,
            transport=self._transport,
            follow_redirects=False,
        ) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
            except httpx2.HTTPError as exc:
                raise IngestionClientError("Backend ingestion API request failed.") from exc

        if response.status_code != 200:
            raise IngestionClientError(
                f"Backend ingestion API returned HTTP {response.status_code}.",
                status_code=response.status_code,
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise IngestionClientError("Backend ingestion API returned invalid JSON.") from exc

        if not isinstance(data, dict):
            raise IngestionClientError("Backend ingestion API returned an unexpected payload.")

        return data

    async def lease_next_job(
        self,
        *,
        worker_id: str,
        lease_duration_seconds: int = 60,
        request_id: str | None = None,
    ) -> LeaseJobResponse:
        data = await self._post_json(
            "/api/v1/internal/ingestion-jobs/lease",
            {
                "workerId": worker_id,
                "leaseDurationSeconds": lease_duration_seconds,
            },
            request_id=request_id,
        )
        return LeaseJobResponse.model_validate(data)

    async def complete_job(
        self,
        *,
        job_id: str,
        lease_token: str,
        business_id: str,
        document_version_id: str,
        chunking: ChunkedDocumentResult,
        request_id: str | None = None,
    ) -> JobMutationResponse:
        data = await self._post_json(
            f"/api/v1/internal/ingestion-jobs/{job_id}/complete",
            {
                "leaseToken": lease_token,
                "businessId": business_id,
                "documentVersionId": document_version_id,
                "chunking": {
                    "chunkVersion": chunking.chunk_version,
                    "chunkMaxChars": chunking.chunk_max_chars,
                    "chunkOverlapChars": chunking.chunk_overlap_chars,
                    "normalizedCharCount": chunking.normalized_char_count,
                    "normalizedSha256": chunking.normalized_sha256,
                    "chunks": [
                        {
                            "chunkId": chunk.chunk_id,
                            "chunkIndex": chunk.chunk_index,
                            "headingPath": chunk.heading_path,
                            "charStart": chunk.char_start,
                            "charEnd": chunk.char_end,
                            "charCount": chunk.char_count,
                            "contentSha256": chunk.content_sha256,
                            "chunkText": chunk.chunk_text,
                        }
                        for chunk in chunking.chunks
                    ],
                },
            },
            request_id=request_id,
        )
        return JobMutationResponse.model_validate(data)

    async def fail_job(
        self,
        *,
        job_id: str,
        lease_token: str,
        business_id: str,
        document_version_id: str,
        error_message: str,
        retryable: bool = True,
        retry_delay_seconds: int = 0,
        request_id: str | None = None,
    ) -> JobMutationResponse:
        data = await self._post_json(
            f"/api/v1/internal/ingestion-jobs/{job_id}/fail",
            {
                "leaseToken": lease_token,
                "businessId": business_id,
                "documentVersionId": document_version_id,
                "errorMessage": error_message.strip()[:500] or "Ingestion job failed.",
                "retryable": retryable,
                "retryDelaySeconds": retry_delay_seconds,
            },
            request_id=request_id,
        )
        return JobMutationResponse.model_validate(data)

