"""Standard-library logging configuration."""

import logging
import sys


def configure_logging(log_level: str) -> None:
    """Configure console output while preserving the server's log handlers."""
    logging.basicConfig(
        stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logging.getLogger("app").setLevel(log_level)
