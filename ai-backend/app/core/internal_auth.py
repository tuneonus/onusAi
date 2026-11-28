"""Internal service-to-service HS256 JWT and scoped delegation verification."""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request
from pydantic import ValidationError

from app.core.config import Settings
from app.modules.respond.schemas import AiDelegationClaims, AiRespondRequest

logger = logging.getLogger(__name__)

EXPECTED_SERVICE_SUBJECT = "service:backend"
EXPECTED_WORKER_SUBJECT = "service:ai-worker"
MAX_TOKEN_LENGTH = 4096
BASE64URL_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
BEARER_CHALLENGE_HEADERS = {"WWW-Authenticate": "Bearer"}


@dataclass(frozen=True)
class InternalServiceContext:
    """Verified identity, scopes, and optional delegation claims from a Node.js token."""

    issuer: str
    audience: str
    subject: str
    token_id: str
    scopes: frozenset[str]
    issued_at: int
    expires_at: int
    delegation: AiDelegationClaims | None = None


def _unauthorized(detail: str, reason: str) -> HTTPException:
    logger.warning("Rejected internal service authentication: %s", reason)
    return HTTPException(
        status_code=401,
        detail=detail,
        headers=BEARER_CHALLENGE_HEADERS,
    )


def _decode_base64url(segment: str) -> bytes:
    if not segment or not BASE64URL_SEGMENT_PATTERN.match(segment):
        raise ValueError("Invalid base64url segment.")

    padded = segment + "=" * (-len(segment) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64url bytes.") from exc

    # Reject non-canonical trailing bits that encode to a different string.
    canonical = base64.urlsafe_b64encode(decoded).rstrip(b"=").decode("ascii")
    if canonical != segment:
        raise ValueError("Non-canonical base64url encoding.")

    return decoded


def _decode_json_object(segment: str) -> dict[str, Any]:
    raw_bytes = _decode_base64url(segment)
    try:
        parsed = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid JSON segment.") from exc

    if not isinstance(parsed, dict):
        raise ValueError("JWT segment must be a JSON object.")

    return parsed


def verify_internal_service_token(
    token: str,
    settings: Settings,
    *,
    now_seconds: int | None = None,
    required_scope: str | None = None,
) -> InternalServiceContext:
    """Verify an HS256 JWT minted by Node.js and enforce issuer, audience, TTL, expiry, and scope."""
    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise _unauthorized("Invalid internal service token.", "malformed_token")

    parts = token.split(".")
    if len(parts) != 3 or any(not part for part in parts):
        raise _unauthorized("Invalid internal service token.", "malformed_token")

    header_b64, payload_b64, signature_b64 = parts

    try:
        header = _decode_json_object(header_b64)
        actual_signature = _decode_base64url(signature_b64)
    except ValueError as exc:
        raise _unauthorized("Invalid internal service token.", "malformed_token") from exc

    if header.get("alg") != "HS256" or header.get("typ") != "JWT":
        raise _unauthorized("Invalid internal service token.", "unsupported_header")

    secret_bytes = settings.internal_auth_secret.get_secret_value().encode("utf-8")
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_signature = hmac.new(secret_bytes, signing_input, hashlib.sha256).digest()

    if len(actual_signature) != len(expected_signature) or not hmac.compare_digest(
        actual_signature, expected_signature
    ):
        raise _unauthorized("Invalid internal service token.", "invalid_signature")

    try:
        payload = _decode_json_object(payload_b64)
    except ValueError as exc:
        raise _unauthorized("Invalid internal service token.", "malformed_payload") from exc

    issuer = payload.get("iss")
    audience = payload.get("aud")
    subject = payload.get("sub")
    token_id = payload.get("jti")
    issued_at = payload.get("iat")
    expires_at = payload.get("exp")
    scope_claim = payload.get("scope")

    if (
        not isinstance(issuer, str)
        or not hmac.compare_digest(issuer, settings.internal_auth_issuer)
        or not isinstance(audience, str)
        or not hmac.compare_digest(audience, settings.internal_auth_audience)
        or subject != EXPECTED_SERVICE_SUBJECT
        or not isinstance(token_id, str)
        or not (1 <= len(token_id) <= 128)
        or type(issued_at) is not int
        or type(expires_at) is not int
        or not isinstance(scope_claim, str)
    ):
        raise _unauthorized("Invalid internal service token.", "invalid_claims")

    if expires_at <= issued_at or (expires_at - issued_at) > settings.internal_auth_max_ttl_seconds:
        raise _unauthorized("Invalid internal service token.", "invalid_ttl")

    current_time = int(time.time()) if now_seconds is None else now_seconds
    skew = settings.internal_auth_clock_skew_seconds

    if issued_at > current_time + skew:
        raise _unauthorized("Invalid internal service token.", "token_not_yet_valid")

    if current_time >= expires_at + skew:
        raise _unauthorized("Internal service token has expired.", "expired_token")

    scopes = frozenset(part for part in scope_claim.split() if part)
    if not scopes:
        raise _unauthorized("Invalid internal service token.", "missing_scope")

    delegation: AiDelegationClaims | None = None
    if "delegation" in payload and payload["delegation"] is not None:
        try:
            delegation = AiDelegationClaims.model_validate(payload["delegation"])
        except ValidationError as exc:
            raise _unauthorized(
                "Invalid internal service token.", "invalid_delegation"
            ) from exc

    if required_scope is not None and required_scope not in scopes:
        logger.warning("Rejected internal service request: insufficient_scope")
        raise HTTPException(
            status_code=403,
            detail="Insufficient internal service scope.",
        )

    return InternalServiceContext(
        issuer=issuer,
        audience=audience,
        subject=subject,
        token_id=token_id,
        scopes=scopes,
        issued_at=issued_at,
        expires_at=expires_at,
        delegation=delegation,
    )


def verify_delegation_binding(
    request_data: AiRespondRequest, auth: InternalServiceContext
) -> AiDelegationClaims:
    """Bind request tenant, actor, conversation, and policy fields to signed JWT delegation."""
    delegation = auth.delegation
    if delegation is None:
        logger.warning("Rejected internal service request: missing_delegation")
        raise HTTPException(
            status_code=403,
            detail="Scoped delegation claims are required.",
        )

    matches = (
        request_data.scope.business_id == delegation.business_id
        and request_data.scope.location_id == delegation.location_id
        and request_data.scope.assistant_id == delegation.assistant_id
        and request_data.scope.assistant_version_id == delegation.assistant_version_id
        and request_data.scope.conversation_id == delegation.conversation_id
        and request_data.scope.channel == delegation.channel
        and request_data.scope.actor_type == delegation.actor_type
        and request_data.scope.actor_id == delegation.actor_id
        and set(request_data.assistant.allowed_tools) == set(delegation.allowed_tools)
        and set(request_data.assistant.allowed_knowledge_scopes)
        == set(delegation.allowed_knowledge_scopes)
        and request_data.assistant.knowledge_location_scope
        == delegation.knowledge_location_scope
        and set(request_data.assistant.knowledge_location_ids)
        == set(delegation.knowledge_location_ids)
    )

    if not matches:
        logger.warning("Rejected internal service request: delegation_mismatch")
        raise HTTPException(
            status_code=403,
            detail="Request context does not match signed delegation.",
        )

    return delegation


def require_internal_service_auth(
    required_scope: str | None = None,
) -> Callable[..., InternalServiceContext]:
    """Build a FastAPI dependency that enforces Bearer internal service auth and optional scope."""

    def dependency(
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
    ) -> InternalServiceContext:
        if authorization is None:
            raise _unauthorized(
                "Internal service authentication required.", "missing_header"
            )

        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise _unauthorized("Invalid internal service token.", "malformed_header")

        settings: Settings = request.app.state.settings
        return verify_internal_service_token(
            parts[1], settings, required_scope=required_scope
        )

    return dependency


def _encode_base64url_json(value: dict[str, Any]) -> str:
    raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def sign_worker_service_token(
    settings: Settings,
    *,
    scope: str = "ingestion:worker",
    ttl_seconds: int = 60,
    now_seconds: int | None = None,
    token_id: str | None = None,
) -> str:
    """Sign a short-lived HS256 JWT for Python-to-Node.js internal worker callbacks."""
    if not scope.strip():
        raise ValueError("Worker token scope must not be empty.")
    if ttl_seconds < 1 or ttl_seconds > settings.internal_auth_max_ttl_seconds:
        raise ValueError("Worker token TTL is out of allowed bounds.")

    issued_at = int(time.time()) if now_seconds is None else now_seconds
    header_b64 = _encode_base64url_json({"alg": "HS256", "typ": "JWT"})
    payload_b64 = _encode_base64url_json(
        {
            "iss": settings.internal_auth_audience,
            "aud": settings.internal_auth_issuer,
            "sub": EXPECTED_WORKER_SUBJECT,
            "iat": issued_at,
            "exp": issued_at + ttl_seconds,
            "jti": token_id or secrets.token_urlsafe(16),
            "scope": scope.strip(),
        }
    )
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    secret_bytes = settings.internal_auth_secret.get_secret_value().encode("utf-8")
    signature_b64 = (
        base64.urlsafe_b64encode(
            hmac.new(secret_bytes, signing_input, hashlib.sha256).digest()
        )
        .rstrip(b"=")
        .decode("ascii")
    )
    return f"{header_b64}.{payload_b64}.{signature_b64}"
