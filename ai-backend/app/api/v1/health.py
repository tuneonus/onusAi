"""Service liveness endpoint."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    """A successful response confirms the HTTP service is running."""

    status: Literal["ok"] = "ok"


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def get_health() -> HealthResponse:
    """Report liveness without contacting external services."""
    return HealthResponse()
