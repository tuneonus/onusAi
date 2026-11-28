"""AI response orchestration supporting explicit mock mode and direct Gemini generation."""

import time

from app.core.async_boundary import run_cpu_bound
from app.core.config import Settings
from app.integrations.gemini_client import GeminiAdapter
from app.integrations.gemini_embeddings import EmbeddingAdapter
from app.modules.respond.prompts import (
    PROMPT_VERSION,
    build_gemini_contents,
    build_system_instruction,
)
from app.modules.respond.rag import generate_rag_response
from app.modules.respond.schemas import (
    AiRespondRequest,
    AiRespondResponse,
    AiUsageMetadata,
)


def _format_mock_answer(display_name: str, user_message: str) -> str:
    normalized = " ".join(user_message.split())
    preview = normalized[:120]
    return (
        f"[Mock AI response — Gemini and RAG not enabled] "
        f"Assistant {display_name} received: {preview}"
    )


async def generate_ai_response(
    request_data: AiRespondRequest,
    settings: Settings,
    gemini_adapter: GeminiAdapter | None = None,
    embedding_adapter: EmbeddingAdapter | None = None,
) -> AiRespondResponse:
    """Route generation to explicit mock mode, scoped RAG, or direct Gemini generation."""
    started_ns = time.monotonic_ns()

    if settings.generation_mode == "mock":
        answer = await run_cpu_bound(
            _format_mock_answer,
            request_data.assistant.display_name,
            request_data.conversation.user_message,
        )
        elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)

        return AiRespondResponse(
            contract_version="1.0",
            request_id=request_data.request_id,
            mode="mock",
            model="mock",
            prompt_version=PROMPT_VERSION,
            grounded=False,
            status="completed",
            answer=answer,
            citations=[],
            tool_proposals=[],
            usage=AiUsageMetadata(
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                latency_ms=elapsed_ms,
            ),
        )

    if gemini_adapter is None:
        if settings.gemini_api_key is None:
            raise ValueError("AI_GEMINI_API_KEY is required in gemini mode.")
        gemini_adapter = GeminiAdapter(
            api_key=settings.gemini_api_key.get_secret_value(),
            default_model=settings.gemini_model,
        )

    if settings.rag_enabled and embedding_adapter is not None:
        return await generate_rag_response(
            request_data,
            settings,
            gemini_adapter,
            embedding_adapter,
        )

    system_instruction = build_system_instruction(
        request_data.assistant, request_data.scope.channel
    )
    contents = build_gemini_contents(
        request_data.conversation.messages, request_data.conversation.user_message
    )

    result = await gemini_adapter.generate(
        system_instruction=system_instruction,
        contents=contents,
        temperature=float(request_data.assistant.model_settings.temperature),
        max_output_tokens=request_data.assistant.model_settings.max_output_tokens,
        fallback_message=request_data.assistant.fallback_message,
    )
    elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)

    return AiRespondResponse(
        contract_version="1.0",
        request_id=request_data.request_id,
        mode="gemini",
        model=result.model,
        prompt_version=PROMPT_VERSION,
        grounded=False,
        status=result.status,
        answer=result.text,
        citations=[],
        tool_proposals=[],
        usage=AiUsageMetadata(
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            total_tokens=result.total_tokens,
            latency_ms=elapsed_ms,
        ),
    )
