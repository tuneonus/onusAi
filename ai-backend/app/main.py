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

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Manage startup and shutdown; shared resources can be added when needed."""
    configure_logging(application.state.settings.log_level)
    logger.info("Starting %s", application.title)
    try:
        yield
    finally:
        logger.info("Stopped %s", application.title)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Assemble an application with validated settings and centralized routes."""
    application_settings = settings if settings is not None else Settings()
    application = FastAPI(title=application_settings.app_name, lifespan=lifespan)
    application.state.settings = application_settings
    application.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
    application.add_exception_handler(Exception, unhandled_exception_handler)
    application.include_router(api_router)
    return application


app = create_app()
