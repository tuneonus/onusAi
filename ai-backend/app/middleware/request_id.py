"""Request correlation ID middleware and validation helpers."""

import re
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import request_id_context

VALID_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def normalize_request_id(raw_value: str | None) -> str:
    """Preserve safe inbound X-Request-Id values or generate a fresh UUID."""
    if raw_value is not None:
        trimmed = raw_value.strip()
        if VALID_REQUEST_ID_PATTERN.match(trimmed):
            return trimmed
    return str(uuid.uuid4())


class RequestIdMiddleware:
    """Pure ASGI middleware that binds X-Request-Id to request state, logs, and responses."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inbound_id: str | None = None
        for name, value in scope.get("headers", []):
            if name.lower() == b"x-request-id":
                inbound_id = value.decode("latin-1")
                break

        request_id = normalize_request_id(inbound_id)
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_context.set(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                headers = [
                    (k, v) for k, v in headers if k.lower() != b"x-request-id"
                ]
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_context.reset(token)
