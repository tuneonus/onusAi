"""Offline unit and integration tests for the async Google Gemini adapter and prompt builder."""

import asyncio
import json
import os
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from google.genai import errors, types

from app.core.async_boundary import run_with_deadline
from app.core.config import Settings
from app.integrations.gemini_client import GeminiAdapter
from app.modules.respond.prompts import (
    PROMPT_VERSION,
    build_gemini_contents,
    build_system_instruction,
)
from app.modules.respond.schemas import AiRespondRequest
from app.modules.respond.service import generate_ai_response

TEST_INTERNAL_SECRET = "test-internal-auth-secret-at-least-32-characters"
TEST_GEMINI_KEY = "AIzaSy-test-secret-do-not-leak-123456"
FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "packages"
    / "ai-contract"
    / "respond-v1.fixture.json"
)
CONTRACT_FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


class FakeAioModels:
    def __init__(self, handler) -> None:
        self._handler = handler
        self.calls: list[dict[str, object]] = []

    async def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return await self._handler(model=model, contents=contents, config=config)


class FakeGenAiClient:
    def __init__(self, handler) -> None:
        self.models = FakeAioModels(handler)
        self.closed = False
        self.aio = SimpleNamespace(models=self.models, aclose=self._aclose)

    async def _aclose(self) -> None:
        self.closed = True


def build_request(**overrides) -> AiRespondRequest:
    payload = json.loads(json.dumps(CONTRACT_FIXTURE["request"]))
    payload["deadlineAtMs"] = int(time.time() * 1000) + 5000
    payload.update(overrides)
    return AiRespondRequest.model_validate(payload)


class PromptAndGeminiAdapterTests(unittest.IsolatedAsyncioTestCase):
    def make_settings(self, mode: str = "gemini") -> Settings:
        return Settings(
            _env_file=None,
            internal_auth_secret=TEST_INTERNAL_SECRET,
            generation_mode=mode,  # type: ignore[arg-type]
            gemini_api_key=TEST_GEMINI_KEY if mode == "gemini" else None,
            gemini_model="gemini-2.5-flash-lite",
        )

    async def test_prompt_builder_and_async_gemini_generation_capture_usage(self) -> None:
        req_payload = json.loads(json.dumps(CONTRACT_FIXTURE["request"]))
        req_payload["conversation"]["messages"] = [
            {"role": "user", "content": "Hello", "sequenceNumber": 1},
            {"role": "assistant", "content": "Hi! How can I help?", "sequenceNumber": 2},
            {"role": "operator", "content": "Mention Friday hours.", "sequenceNumber": 3},
        ]
        req = AiRespondRequest.model_validate(req_payload)

        async def succeed(**_kwargs):
            return SimpleNamespace(
                text="We are open 9am to 5pm on Friday.",
                prompt_feedback=None,
                candidates=[
                    SimpleNamespace(
                        finish_reason=types.FinishReason.STOP,
                        content=SimpleNamespace(parts=[SimpleNamespace(text="We are open 9am to 5pm on Friday.")]),
                    )
                ],
                usage_metadata=SimpleNamespace(
                    prompt_token_count=42,
                    candidates_token_count=11,
                    total_token_count=53,
                ),
            )

        fake_client = FakeGenAiClient(succeed)
        adapter = GeminiAdapter(
            api_key=TEST_GEMINI_KEY,
            default_model="gemini-2.5-flash-lite",
            client=fake_client,
        )

        response = await generate_ai_response(req, self.make_settings("gemini"), adapter)

        self.assertEqual(response.mode, "gemini")
        self.assertEqual(response.model, "gemini-2.5-flash-lite")
        self.assertEqual(response.prompt_version, PROMPT_VERSION)
        self.assertFalse(response.grounded)
        self.assertEqual(response.status, "completed")
        self.assertEqual(response.answer, "We are open 9am to 5pm on Friday.")
        self.assertEqual(response.usage.input_tokens, 42)
        self.assertEqual(response.usage.output_tokens, 11)
        self.assertEqual(response.usage.total_tokens, 53)

        self.assertEqual(len(fake_client.models.calls), 1)
        call = fake_client.models.calls[0]
        self.assertEqual(call["model"], "gemini-2.5-flash-lite")
        config = call["config"]
        self.assertIsInstance(config, types.GenerateContentConfig)
        self.assertEqual(config.temperature, 0.2)
        self.assertEqual(config.max_output_tokens, 512)
        self.assertIn(PROMPT_VERSION, config.system_instruction)
        self.assertIn("Answer using verified business policies only.", config.system_instruction)

        contents = call["contents"]
        self.assertEqual([c.role for c in contents], ["user", "model", "user", "user"])
        self.assertIn("[Operator note]: Mention Friday hours.", contents[2].parts[0].text)
        self.assertEqual(contents[3].parts[0].text, "Do you have slots tomorrow morning?")

        await adapter.aclose()
        self.assertTrue(fake_client.closed)

    async def test_safety_blocks_abstain_with_fallback_message(self) -> None:
        req = build_request()

        # Candidate finish_reason=SAFETY
        async def candidate_blocked(**_kwargs):
            return SimpleNamespace(
                text=None,
                prompt_feedback=None,
                candidates=[SimpleNamespace(finish_reason=types.FinishReason.SAFETY, content=None)],
                usage_metadata=SimpleNamespace(
                    prompt_token_count=15, candidates_token_count=0, total_token_count=15
                ),
            )

        adapter = GeminiAdapter(
            api_key=TEST_GEMINI_KEY,
            default_model="gemini-2.5-flash-lite",
            client=FakeGenAiClient(candidate_blocked),
        )
        with self.assertLogs("app.integrations.gemini_client", level="WARNING"):
            result = await generate_ai_response(req, self.make_settings("gemini"), adapter)

        self.assertEqual(result.status, "abstained")
        self.assertEqual(result.answer, req.assistant.fallback_message)
        self.assertEqual(result.usage.input_tokens, 15)

        # Prompt-level block_reason=PROHIBITED_CONTENT
        async def prompt_blocked(**_kwargs):
            return SimpleNamespace(
                text=None,
                prompt_feedback=SimpleNamespace(
                    block_reason=types.BlockedReason.PROHIBITED_CONTENT
                ),
                candidates=[],
                usage_metadata=None,
            )

        adapter2 = GeminiAdapter(
            api_key=TEST_GEMINI_KEY,
            default_model="gemini-2.5-flash-lite",
            client=FakeGenAiClient(prompt_blocked),
        )
        with self.assertLogs("app.integrations.gemini_client", level="WARNING"):
            result2 = await generate_ai_response(req, self.make_settings("gemini"), adapter2)

        self.assertEqual(result2.status, "abstained")
        self.assertEqual(result2.answer, req.assistant.fallback_message)
        self.assertEqual(result2.usage.total_tokens, 0)

    async def test_rate_limits_api_errors_timeouts_and_invalid_responses_hide_secrets(
        self,
    ) -> None:
        req = build_request()
        settings = self.make_settings("gemini")

        async def raise_rate_limit(**_kwargs):
            raise errors.APIError(
                429, {"error": {"message": f"Quota exceeded for key {TEST_GEMINI_KEY}"}}
            )

        async def raise_auth_error(**_kwargs):
            raise errors.APIError(
                403, {"error": {"message": f"Invalid key {TEST_GEMINI_KEY}"}}
            )

        async def raise_upstream_timeout(**_kwargs):
            raise errors.APIError(504, {"error": {"message": "Upstream timeout"}})

        async def return_empty(**_kwargs):
            return SimpleNamespace(
                text="   ",
                prompt_feedback=None,
                candidates=[SimpleNamespace(finish_reason=types.FinishReason.STOP, content=None)],
                usage_metadata=None,
            )

        async def raise_unexpected(**_kwargs):
            raise RuntimeError(f"Socket error with {TEST_GEMINI_KEY} and prompt")

        cases = [
            (raise_rate_limit, 429, "AI provider rate limit exceeded."),
            (raise_auth_error, 502, "AI provider request failed."),
            (raise_upstream_timeout, 504, "AI provider request timed out."),
            (return_empty, 502, "AI provider returned an invalid response."),
            (raise_unexpected, 502, "AI provider request failed."),
        ]

        for handler, expected_status, expected_detail in cases:
            adapter = GeminiAdapter(
                api_key=TEST_GEMINI_KEY,
                default_model="gemini-2.5-flash-lite",
                client=FakeGenAiClient(handler),
            )
            with self.assertLogs("app.integrations.gemini_client", level="WARNING") as logs:
                with self.assertRaises(HTTPException) as raised:
                    await generate_ai_response(req, settings, adapter)
            self.assertEqual(raised.exception.status_code, expected_status)
            self.assertEqual(raised.exception.detail, expected_detail)
            joined = " ".join(logs.output)
            self.assertNotIn(TEST_GEMINI_KEY, joined)
            self.assertNotIn(TEST_GEMINI_KEY, str(raised.exception.detail))

        # Deadline cancellation interrupts slow Gemini calls with 504.
        async def slow_gemini(**_kwargs):
            await asyncio.sleep(1.0)

        slow_adapter = GeminiAdapter(
            api_key=TEST_GEMINI_KEY,
            default_model="gemini-2.5-flash-lite",
            client=FakeGenAiClient(slow_gemini),
        )
        with self.assertRaises(HTTPException) as timeout_exc:
            await run_with_deadline(
                generate_ai_response(req, settings, slow_adapter), 25
            )
        self.assertEqual(timeout_exc.exception.status_code, 504)

    def test_system_instruction_and_contents_unit(self) -> None:
        req = build_request()
        instruction = build_system_instruction(req.assistant, req.scope.channel)
        self.assertIn(PROMPT_VERSION, instruction)
        self.assertIn("Alpha Concierge", instruction)
        self.assertIn("untrusted user input", instruction)

        contents = build_gemini_contents(req.conversation.messages, "Hello there")
        self.assertEqual(len(contents), 2)
        self.assertEqual(contents[-1].parts[0].text, "Hello there")

    def test_create_app_in_gemini_mode_creates_and_closes_adapter(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_INTERNAL_AUTH_SECRET": TEST_INTERNAL_SECRET,
                "AI_GENERATION_MODE": "gemini",
                "AI_GEMINI_API_KEY": TEST_GEMINI_KEY,
            },
        ):
            from app.main import create_app

            app = create_app()
            self.assertIsNotNone(app.state.gemini_adapter)

