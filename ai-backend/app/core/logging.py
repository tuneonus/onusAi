"""Standard-library logging configuration with correlation ID context."""

import logging
import sys
from contextvars import ContextVar

request_id_context: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdLogFilter(logging.Filter):
    """Attach the active request correlation ID to every formatted log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_context.get()
        return True


def configure_logging(log_level: str) -> None:
    """Configure console output while preserving the server's log handlers."""
    logging.basicConfig(
        stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s",
    )
    for handler in logging.getLogger().handlers:
        if not any(isinstance(f, RequestIdLogFilter) for f in handler.filters):
            handler.addFilter(RequestIdLogFilter())

    logging.getLogger("app").setLevel(log_level)
