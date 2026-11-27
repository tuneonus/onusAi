"""Cross-language AI contract fixture and FastAPI async-boundary tests."""

import asyncio
import json
import threading
import time
import unittest
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError

from app.core.async_boundary import run_cpu_bound, run_with_deadline
from app.core.config import Settings
from app.core.internal_auth import InternalServiceContext, verify_delegation_binding
from app.modules.respond.schemas import (
    AiDelegationClaims,
    AiRespondRequest,
    AiRespondResponse,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "packages"
    / "ai-contract"
    / "respond-v1.fixture.json"
)
CONTRACT_FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
TEST_INTERNAL_SECRET = "test-internal-auth-secret-at-least-32-characters"


class ContractFixtureTests(unittest.TestCase):
    def test_shared_contract_fixture_validates_strictly_and_binds_delegation(
        self,
    ) -> None:
        request_model = AiRespondRequest.model_validate(CONTRACT_FIXTURE["request"])
        response_model = AiRespondResponse.model_validate(CONTRACT_FIXTURE["response"])

        self.assertEqual(request_model.contract_version, "1.0")
        self.assertEqual(response_model.mode, "mock")
        self.assertFalse(response_model.grounded)

        serialized = response_model.model_dump(by_alias=True)
        self.assertEqual(serialized, CONTRACT_FIXTURE["response"])

        delegation = AiDelegationClaims.model_validate(
            {
                **CONTRACT_FIXTURE["request"]["scope"],
                "allowedTools": CONTRACT_FIXTURE["request"]["assistant"][
                    "allowedTools"
                ],
                "allowedKnowledgeScopes": CONTRACT_FIXTURE["request"]["assistant"][
                    "allowedKnowledgeScopes"
                ],
                "knowledgeLocationScope": CONTRACT_FIXTURE["request"]["assistant"][
                    "knowledgeLocationScope"
                ],
                "knowledgeLocationIds": CONTRACT_FIXTURE["request"]["assistant"][
                    "knowledgeLocationIds"
                ],
            }
        )
        auth = InternalServiceContext(
            issuer="onusai-backend",
            audience="onusai-ai-backend",
            subject="service:backend",
            token_id="fixture-1",
            scopes=frozenset({"ai:respond"}),
            issued_at=1_700_000_000,
            expires_at=1_700_000_060,
            delegation=delegation,
        )
        bound = verify_delegation_binding(request_model, auth)
        self.assertEqual(bound.business_id, request_model.scope.business_id)

    def test_schema_rejects_bool_numbers_visitor_staff_knowledge_and_extra_keys(
        self,
    ) -> None:
        bad_bool = json.loads(json.dumps(CONTRACT_FIXTURE["request"]))
        bad_bool["deadlineAtMs"] = True
        with self.assertRaises(ValidationError):
            AiRespondRequest.model_validate(bad_bool)

        bad_visitor = json.loads(json.dumps(CONTRACT_FIXTURE["request"]))
        bad_visitor["scope"]["channel"] = "visitor"
        bad_visitor["scope"]["actorType"] = "visitor"
        with self.assertRaises(ValidationError):
            AiRespondRequest.model_validate(bad_visitor)

        extra_key = json.loads(json.dumps(CONTRACT_FIXTURE["request"]))
        extra_key["scope"]["extraField"] = "nope"
        with self.assertRaises(ValidationError):
            AiRespondRequest.model_validate(extra_key)


class AsyncBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_cpu_bound_offloading_keeps_event_loop_responsive(self) -> None:
        loop_thread_id = threading.get_ident()
        ticks = 0
        stop_ticker = False

        async def ticker() -> None:
            nonlocal ticks
            while not stop_ticker:
                await asyncio.sleep(0.01)
                ticks += 1

        def blocking_cpu_work(duration_seconds: float) -> int:
            time.sleep(duration_seconds)
            return threading.get_ident()

        ticker_task = asyncio.create_task(ticker())
        try:
            worker_thread_id = await run_cpu_bound(blocking_cpu_work, 0.1)
        finally:
            stop_ticker = True
            await ticker_task

        self.assertNotEqual(worker_thread_id, loop_thread_id)
        self.assertGreaterEqual(ticks, 4)

    async def test_run_with_deadline_cancels_slow_coroutines_with_504(self) -> None:
        cancelled = False

        async def slow_ai_step() -> str:
            nonlocal cancelled
            try:
                await asyncio.sleep(1.0)
                return "unexpected"
            except asyncio.CancelledError:
                cancelled = True
                raise

        with self.assertRaises(HTTPException) as raised:
            await run_with_deadline(slow_ai_step(), 25)

        self.assertEqual(raised.exception.status_code, 504)
        self.assertTrue(cancelled)

        # Already-expired deadline raises immediately without running the coroutine.
        with self.assertRaises(HTTPException) as expired:
            await run_with_deadline(slow_ai_step(), 0)
        self.assertEqual(expired.exception.status_code, 504)

    def test_settings_unused_warning_sanity(self) -> None:
        settings = Settings(
            _env_file=None,
            internal_auth_secret=TEST_INTERNAL_SECRET,
            generation_mode="mock",
        )
        self.assertEqual(settings.internal_max_request_bytes, 262_144)

