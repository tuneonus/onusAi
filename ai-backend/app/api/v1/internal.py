"""Authenticated internal endpoints called only by the Node.js business service."""

import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.core.async_boundary import run_with_deadline
from app.core.config import Settings
from app.core.internal_auth import (
    InternalServiceContext,
    require_internal_service_auth,
    verify_delegation_binding,
)
from app.modules.respond.schemas import AiRespondRequest, AiRespondResponse
from app.modules.respond.service import generate_ai_response
from app.modules.retrieval.schemas import AiRetrieveRequest, AiRetrieveResponse
from app.modules.retrieval.service import perform_scoped_retrieval

router = APIRouter(prefix="/internal", tags=["Internal"])


class InternalHealthResponse(BaseModel):
    """Confirms both service liveness and authenticated internal service access."""

    status: Literal["ok"] = "ok"
    subject: str


@router.get("/health", response_model=InternalHealthResponse)
async def get_internal_health(
    response: Response,
    auth: Annotated[
        InternalServiceContext,
        Depends(require_internal_service_auth("ai:health")),
    ],
) -> InternalHealthResponse:
    """Verify internal service authentication without contacting external AI providers."""
    response.headers["Cache-Control"] = "no-store"
    return InternalHealthResponse(subject=auth.subject)


@router.post("/respond", response_model=AiRespondResponse)
async def post_internal_respond(
    request: Request,
    response: Response,
    payload: AiRespondRequest,
    auth: Annotated[
        InternalServiceContext,
        Depends(require_internal_service_auth("ai:respond")),
    ],
) -> AiRespondResponse:
    """Validate delegation binding, correlation ID, and deadline, then return a mock AI contract."""
    verify_delegation_binding(payload, auth)

    if (
        "x-request-id" in request.headers
        and getattr(request.state, "request_id", None) != payload.request_id
    ):
        raise HTTPException(
            status_code=400,
            detail="Request ID mismatch between header and payload.",
        )

    settings: Settings = request.app.state.settings
    now_ms = int(time.time() * 1000)
    remaining_ms = payload.deadline_at_ms - now_ms

    if remaining_ms <= 0:
        raise HTTPException(status_code=504, detail="AI request deadline exceeded.")

    if remaining_ms > settings.internal_max_deadline_ms:
        raise HTTPException(
            status_code=422, detail="AI request deadline exceeds allowed maximum."
        )

    result = await run_with_deadline(
        generate_ai_response(
            payload,
            settings,
            getattr(request.app.state, "gemini_adapter", None),
            getattr(request.app.state, "embedding_adapter", None),
        ),
        remaining_ms,
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Request-Id"] = payload.request_id
    return result


@router.post("/retrieve", response_model=AiRetrieveResponse)
async def post_internal_retrieve(
    request: Request,
    response: Response,
    payload: AiRetrieveRequest,
    auth: Annotated[
        InternalServiceContext,
        Depends(require_internal_service_auth("ai:retrieve")),
    ],
) -> AiRetrieveResponse:
    """Embed query with RETRIEVAL_QUERY, search Qdrant with tenant/scope filters, and validate via Node.js."""
    if (
        "x-request-id" in request.headers
        and getattr(request.state, "request_id", None) != payload.request_id
    ):
        raise HTTPException(
            status_code=400,
            detail="Request ID mismatch between header and payload.",
        )

    settings: Settings = request.app.state.settings
    now_ms = int(time.time() * 1000)
    remaining_ms = payload.deadline_at_ms - now_ms

    if remaining_ms <= 0:
        raise HTTPException(status_code=504, detail="AI request deadline exceeded.")

    if remaining_ms > settings.internal_max_deadline_ms:
        raise HTTPException(
            status_code=422, detail="AI request deadline exceeds allowed maximum."
        )

    result = await run_with_deadline(
        perform_scoped_retrieval(
            payload,
            settings,
            embedding_adapter=getattr(request.app.state, "embedding_adapter", None),
        ),
        remaining_ms,
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Request-Id"] = payload.request_id
    return result
