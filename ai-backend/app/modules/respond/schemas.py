"""Strict Pydantic contracts matching Node.js backend/src/integrations/ai/ai-contract.ts."""

import re
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    model_validator,
)

ApprovedToolId = Literal[
    "lookup_availability",
    "request_lead_capture",
    "request_appointment_booking",
    "request_human_handoff",
]
AssistantTone = Literal[
    "professional",
    "friendly",
    "concise",
    "empathetic",
    "formal",
]
KnowledgeScope = Literal["public", "staff_only"]
KnowledgeLocationScope = Literal[
    "business_wide",
    "assigned_location",
    "selected_locations",
]
ConversationChannel = Literal["playground", "visitor"]
AiActorType = Literal["staff", "visitor"]
MessageRole = Literal["user", "assistant", "operator", "system"]

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


class StrictContractModel(BaseModel):
    """Base contract model forbidding unknown keys and serializing camelCase JSON."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
        str_strip_whitespace=True,
    )


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


class AiDelegationClaims(StrictContractModel):
    """Signed tenant, actor, conversation, and policy claims minted by Node.js."""

    business_id: UUID = Field(alias="businessId")
    location_id: UUID | None = Field(alias="locationId")
    assistant_id: UUID = Field(alias="assistantId")
    assistant_version_id: UUID = Field(alias="assistantVersionId")
    conversation_id: UUID = Field(alias="conversationId")
    channel: ConversationChannel
    actor_type: AiActorType = Field(alias="actorType")
    actor_id: UUID = Field(alias="actorId")
    allowed_tools: list[ApprovedToolId] = Field(alias="allowedTools", max_length=10)
    allowed_knowledge_scopes: list[KnowledgeScope] = Field(
        alias="allowedKnowledgeScopes", min_length=1, max_length=2
    )
    knowledge_location_scope: KnowledgeLocationScope = Field(
        alias="knowledgeLocationScope"
    )
    knowledge_location_ids: list[UUID] = Field(
        alias="knowledgeLocationIds", max_length=50
    )

    @model_validator(mode="after")
    def validate_channel_and_policy(self) -> "AiDelegationClaims":
        if self.channel == "visitor" and self.actor_type != "visitor":
            raise ValueError("Visitor channel requires visitor actorType.")
        if self.channel == "visitor" and "staff_only" in self.allowed_knowledge_scopes:
            raise ValueError("Visitor channel cannot access staff-only knowledge.")
        self.allowed_tools = _dedupe_preserve_order(self.allowed_tools)  # type: ignore[assignment]
        self.allowed_knowledge_scopes = _dedupe_preserve_order(
            self.allowed_knowledge_scopes
        )  # type: ignore[assignment]
        self.knowledge_location_ids = list(dict.fromkeys(self.knowledge_location_ids))
        return self


class AiScopeContext(StrictContractModel):
    """Authoritative tenant, assistant, conversation, and actor scope for a request."""

    business_id: UUID = Field(alias="businessId")
    location_id: UUID | None = Field(alias="locationId")
    assistant_id: UUID = Field(alias="assistantId")
    assistant_version_id: UUID = Field(alias="assistantVersionId")
    conversation_id: UUID = Field(alias="conversationId")
    channel: ConversationChannel
    actor_type: AiActorType = Field(alias="actorType")
    actor_id: UUID = Field(alias="actorId")

    @model_validator(mode="after")
    def validate_actor_for_channel(self) -> "AiScopeContext":
        if self.channel == "visitor" and self.actor_type != "visitor":
            raise ValueError("Visitor channel requires visitor actorType.")
        return self


class AiModelSettings(StrictContractModel):
    """Bounded model runtime parameters from assistant version configuration."""

    temperature: StrictFloat | StrictInt = Field(ge=0, le=1)
    max_output_tokens: StrictInt = Field(alias="maxOutputTokens", ge=64, le=2048)
    max_context_messages: StrictInt = Field(
        alias="maxContextMessages", ge=1, le=20
    )


class AiRequestAssistantConfig(StrictContractModel):
    """Assistant instructions, tone, and policy sent by Node.js."""

    display_name: str = Field(alias="displayName", min_length=1, max_length=120)
    system_instructions: str = Field(
        alias="systemInstructions", min_length=1, max_length=8000
    )
    fallback_message: str = Field(
        alias="fallbackMessage", min_length=1, max_length=1000
    )
    language: str = Field(min_length=2, max_length=16)
    tone: AssistantTone
    model_settings: AiModelSettings = Field(alias="modelSettings")
    allowed_tools: list[ApprovedToolId] = Field(alias="allowedTools", max_length=10)
    allowed_knowledge_scopes: list[KnowledgeScope] = Field(
        alias="allowedKnowledgeScopes", min_length=1, max_length=2
    )
    knowledge_location_scope: KnowledgeLocationScope = Field(
        alias="knowledgeLocationScope"
    )
    knowledge_location_ids: list[UUID] = Field(
        alias="knowledgeLocationIds", max_length=50
    )

    @model_validator(mode="after")
    def normalize_lists(self) -> "AiRequestAssistantConfig":
        self.allowed_tools = _dedupe_preserve_order(self.allowed_tools)  # type: ignore[assignment]
        self.allowed_knowledge_scopes = _dedupe_preserve_order(
            self.allowed_knowledge_scopes
        )  # type: ignore[assignment]
        self.knowledge_location_ids = list(dict.fromkeys(self.knowledge_location_ids))
        return self


class AiConversationMessageItem(StrictContractModel):
    """Single bounded historical turn message."""

    role: MessageRole
    content: str = Field(min_length=1, max_length=8000)
    sequence_number: StrictInt = Field(alias="sequenceNumber", ge=1)


class AiConversationPayload(StrictContractModel):
    """Conversation context messages and current user message."""

    messages: list[AiConversationMessageItem] = Field(max_length=20)
    user_message: str = Field(alias="userMessage", min_length=1, max_length=4000)


class AiRespondRequest(StrictContractModel):
    """Private Node.js-to-FastAPI AI respond contract (v1.0)."""

    contract_version: Literal["1.0"] = Field(alias="contractVersion")
    request_id: str = Field(alias="requestId", min_length=8, max_length=64)
    idempotency_key: str | None = Field(
        default=None, alias="idempotencyKey", min_length=1, max_length=128
    )
    deadline_at_ms: StrictInt = Field(alias="deadlineAtMs", ge=1)
    scope: AiScopeContext
    assistant: AiRequestAssistantConfig
    conversation: AiConversationPayload

    @model_validator(mode="after")
    def validate_cross_fields(self) -> "AiRespondRequest":
        if not REQUEST_ID_PATTERN.match(self.request_id):
            raise ValueError("Invalid requestId format.")
        if (
            self.scope.channel == "visitor"
            and "staff_only" in self.assistant.allowed_knowledge_scopes
        ):
            raise ValueError("Visitor channel cannot access staff-only knowledge.")
        if len(self.conversation.messages) > self.assistant.model_settings.max_context_messages:
            raise ValueError("conversation.messages exceeds assistant maxContextMessages.")
        return self


class AiCitation(StrictContractModel):
    """Authorized knowledge source reference returned with a grounded answer."""

    source_id: str = Field(alias="sourceId", min_length=1)
    chunk_id: str = Field(alias="chunkId", min_length=1)
    title: str = Field(min_length=1)


class AiToolProposal(StrictContractModel):
    """Schema-validated tool call proposed by AI for Node.js verification."""

    tool_name: ApprovedToolId = Field(alias="toolName")
    arguments_json: str = Field(alias="argumentsJson")


class AiUsageMetadata(StrictContractModel):
    """Token and latency measurements returned by the AI service."""

    input_tokens: StrictInt = Field(alias="inputTokens", ge=0)
    output_tokens: StrictInt = Field(alias="outputTokens", ge=0)
    total_tokens: StrictInt = Field(alias="totalTokens", ge=0)
    latency_ms: StrictInt = Field(alias="latencyMs", ge=0)


class AiRespondResponse(StrictContractModel):
    """Validated response contract returned from FastAPI to Node.js."""

    contract_version: Literal["1.0"] = Field(default="1.0", alias="contractVersion")
    request_id: str = Field(alias="requestId")
    mode: Literal["mock", "gemini"] = "mock"
    model: str = Field(default="mock", min_length=1, max_length=100)
    prompt_version: str = Field(
        default="respond-v1", alias="promptVersion", min_length=1, max_length=32
    )
    grounded: StrictBool = False
    status: Literal["completed", "abstained"] = "completed"
    answer: str = Field(min_length=1, max_length=8000)
    citations: list[AiCitation] = Field(default_factory=list, max_length=20)
    tool_proposals: list[AiToolProposal] = Field(
        default_factory=list, alias="toolProposals", max_length=5
    )
    usage: AiUsageMetadata

