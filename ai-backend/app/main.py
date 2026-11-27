"""Application composition and ASGI entry point."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from app.api.v1.router import api_router
from app.core.config import Settings
from app.core.exceptions import (
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import configure_logging
from app.integrations.gemini_client import GeminiAdapter
from app.middleware.body_limit import MaxBodySizeMiddleware
from app.middleware.request_id import RequestIdMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Manage startup and shutdown; close the async Gemini client cleanly."""
    configure_logging(application.state.settings.log_level)
    logger.info("Starting %s", application.title)
    try:
        yield
    finally:
        adapter: GeminiAdapter | None = getattr(
            application.state, "gemini_adapter", None
        )
        if adapter is not None:
            try:
                await adapter.aclose()
            except Exception as exc:
                logger.warning("Failed to close Gemini client: %s", type(exc).__name__)
        logger.info("Stopped %s", application.title)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Assemble an application with validated settings, middleware, and centralized routes."""
    application_settings = settings if settings is not None else Settings()
    application = FastAPI(title=application_settings.app_name, lifespan=lifespan)
    application.state.settings = application_settings
    application.state.gemini_adapter = (
        GeminiAdapter(
            api_key=application_settings.gemini_api_key.get_secret_value(),
            default_model=application_settings.gemini_model,
        )
        if application_settings.generation_mode == "gemini"
        and application_settings.gemini_api_key is not None
        else None
    )
    application.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
    application.add_exception_handler(Exception, unhandled_exception_handler)
    application.include_router(api_router)
    # Added in inner-to-outer order so RequestIdMiddleware wraps body-limit and error responses.
    application.add_middleware(
        MaxBodySizeMiddleware,
        max_bytes=application_settings.internal_max_request_bytes,
    )
    application.add_middleware(RequestIdMiddleware)
    return application


app = create_app()
