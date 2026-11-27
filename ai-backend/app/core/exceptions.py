"""Safe responses for request validation and unexpected failures."""

import logging

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

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
    logger.error(
        "Unhandled %s during %s request", type(exception).__name__, request.method
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})
