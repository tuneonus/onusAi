"""Helpers separating async I/O deadlines from CPU-bound thread offloading."""

import asyncio
from collections.abc import Callable, Coroutine
from typing import TypeVar

import anyio
from fastapi import HTTPException

T = TypeVar("T")


async def run_cpu_bound(func: Callable[..., T], *args: object, **kwargs: object) -> T:
    """Offload synchronous CPU-bound work to a worker thread so the asyncio event loop stays responsive."""
    return await anyio.to_thread.run_sync(lambda: func(*args, **kwargs))


async def run_with_deadline(
    operation: Coroutine[object, object, T], remaining_ms: int
) -> T:
    """Bound an async AI operation by the remaining request deadline."""
    if remaining_ms <= 0:
        operation.close()
        raise HTTPException(status_code=504, detail="AI request deadline exceeded.")

    try:
        return await asyncio.wait_for(operation, timeout=remaining_ms / 1000.0)
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504, detail="AI request deadline exceeded."
        ) from exc

