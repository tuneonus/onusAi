"""Safe responses for request validation and unexpected failures."""

import logging

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import request_id_context
from app.middleware.request_id import normalize_request_id

logger = logging.getLogger(__name__)


async def validation_exception_handler(
    request: Request, exception: RequestValidationError
) -> JSONResponse:
    """Describe invalid fields without returning submitted input or context."""
    errors = [
        {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
        for error in exception.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


async def unhandled_exception_handler(
    request: Request, exception: Exception
) -> JSONResponse:
    """Log minimal failure metadata and keep internal details out of responses."""
    state_request_id = getattr(request.state, "request_id", None)
    request_id = (
        state_request_id
        if isinstance(state_request_id, str)
        else request_id_context.get()
    )
    if not request_id or request_id == "-":
        request_id = normalize_request_id(request.headers.get("x-request-id"))

    logger.error(
        "Unhandled %s during %s request (request_id=%s)",
        type(exception).__name__,
        request.method,
        request_id,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
        headers={"X-Request-Id": request_id},
    )
