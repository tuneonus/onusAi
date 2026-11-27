"""Streaming-safe ASGI request body size limit middleware."""

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

METHODS_WITH_BODY = frozenset({"POST", "PUT", "PATCH"})


class MaxBodySizeMiddleware:
    """Reject HTTP requests exceeding max_bytes via Content-Length or streamed chunk counting."""

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    content_length = int(value.decode("ascii"))
                except ValueError:
                    response = JSONResponse(
                        status_code=400,
                        content={"detail": "Invalid Content-Length header."},
                    )
                    await response(scope, receive, send)
                    return

                if content_length > self.max_bytes:
                    response = JSONResponse(
                        status_code=413,
                        content={
                            "detail": "Request payload exceeds maximum allowed size."
                        },
                    )
                    await response(scope, receive, send)
                    return

        if scope.get("method", "GET").upper() not in METHODS_WITH_BODY:
            await self.app(scope, receive, send)
            return

        chunks: list[bytes] = []
        total_bytes = 0

        while True:
            message = await receive()
            if message["type"] != "http.request":
                await self.app(scope, receive, send)
                return

            chunk = message.get("body", b"")
            total_bytes += len(chunk)
            if total_bytes > self.max_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={
                        "detail": "Request payload exceeds maximum allowed size."
                    },
                )
                await response(scope, receive, send)
                return

            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        buffered_body = b"".join(chunks)
        body_delivered = False

        async def replay_receive() -> Message:
            nonlocal body_delivered
            if not body_delivered:
                body_delivered = True
                return {
                    "type": "http.request",
                    "body": buffered_body,
                    "more_body": False,
                }
            return await receive()

        await self.app(scope, replay_receive, send)
