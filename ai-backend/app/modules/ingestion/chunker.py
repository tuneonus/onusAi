"""Versioned document text normalization and deterministic boundary-aware chunking."""

import hashlib
import re
import unicodedata
import uuid
from dataclasses import dataclass
from typing import Literal

ATX_HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.+?)(?:\s+#+)?$")
FENCE_PATTERN = re.compile(r"^(`{3,}|~{3,})")


@dataclass(frozen=True)
class NormalizedChunk:
    """One deterministic chunk with exact character offsets and source metadata."""

    chunk_id: str
    chunk_index: int
    heading_path: list[str]
    char_start: int
    char_end: int
    char_count: int
    content_sha256: str
    chunk_text: str


@dataclass(frozen=True)
class ChunkedDocumentResult:
    """Normalized text summary and ordered chunks for a document version."""

    chunk_version: str
    chunk_max_chars: int
    chunk_overlap_chars: int
    normalized_char_count: int
    normalized_sha256: str
    chunks: list[NormalizedChunk]


def normalize_document_text(
    raw_text: str,
    source_type: Literal["txt", "markdown"],
) -> str:
    """Normalize line endings, Unicode (NFC), and excessive blank lines while preserving structure."""
    text = unicodedata.normalize("NFC", raw_text)
    if text.startswith("\ufeff"):
        text = text[1:]

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip(" \t") for line in text.split("\n")]
    joined = "\n".join(lines)
    joined = re.sub(r"\n{3,}", "\n\n", joined)
    normalized = joined.strip("\n")

    if not normalized.strip():
        raise ValueError("Normalized document text must not be blank.")

    return normalized


def _build_heading_index(
    normalized_text: str,
    source_type: Literal["txt", "markdown"],
) -> list[tuple[int, list[str]]]:
    """Map character offsets in normalized Markdown to their active heading hierarchy."""
    if source_type != "markdown":
        return [(0, [])]

    checkpoints: list[tuple[int, list[str]]] = [(0, [])]
    stack: list[tuple[int, str]] = []
    in_fence = False
    fence_char = ""
    offset = 0

    for line in normalized_text.split("\n"):
        stripped = line.lstrip()
        fence_match = FENCE_PATTERN.match(stripped)
        if fence_match:
            marker = fence_match.group(1)[0]
            if not in_fence:
                in_fence = True
                fence_char = marker
            elif marker == fence_char:
                in_fence = False
                fence_char = ""
        elif not in_fence:
            heading_match = ATX_HEADING_PATTERN.match(stripped)
            if heading_match:
                level = len(heading_match.group(1))
                title = heading_match.group(2).strip()
                while stack and stack[-1][0] >= level:
                    stack.pop()
                stack.append((level, title))
                checkpoints.append((offset, [item[1] for item in stack]))

        offset += len(line) + 1

    return checkpoints


def _heading_path_at(
    checkpoints: list[tuple[int, list[str]]],
    char_offset: int,
) -> list[str]:
    active: list[str] = []
    for cp_offset, path in checkpoints:
        if cp_offset > char_offset:
            break
        active = path
    return list(active)


def _find_split_end(text: str, start: int, max_chars: int) -> int:
    """Choose a clean boundary near start + max_chars without splitting words unnecessarily."""
    limit = min(len(text), start + max_chars)
    if limit >= len(text):
        return len(text)

    min_split = start + max(1, max_chars // 3)
    window = text[start:limit]

    for sep in ("\n\n", "\n", ". ", "! ", "? "):
        idx = window.rfind(sep)
        if idx != -1:
            candidate = start + idx + (0 if sep.startswith("\n") else 1)
            if candidate >= min_split:
                return candidate

    space_idx = window.rfind(" ")
    if space_idx != -1 and start + space_idx >= min_split:
        return start + space_idx

    return limit


def _advance_next_start(text: str, start: int, raw_end: int, overlap_chars: int) -> int:
    """Compute the next chunk start with bounded overlap, avoiding mid-word starts when possible."""
    if overlap_chars <= 0:
        return raw_end

    candidate = max(start + 1, raw_end - overlap_chars)
    if candidate <= start + 1 or candidate >= raw_end:
        return max(start + 1, raw_end)

    # If landing inside a word, advance to the next whitespace boundary within half the overlap.
    if not text[candidate - 1].isspace() and not text[candidate].isspace():
        search_limit = min(raw_end, candidate + max(1, overlap_chars // 2))
        for pos in range(candidate, search_limit):
            if text[pos].isspace():
                while pos < raw_end and text[pos].isspace():
                    pos += 1
                if pos < raw_end:
                    return pos
                break

    return candidate


def deterministic_chunk_id(
    *,
    chunk_version: str,
    document_version_id: str,
    chunk_index: int,
    content_sha256: str,
) -> str:
    """Generate a reproducible UUIDv5 for a chunk from its version, index, and content hash."""
    name = f"onussync:chunk:{chunk_version}:{document_version_id}:{chunk_index}:{content_sha256}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, name))


def chunk_document_text(
    *,
    document_version_id: str,
    source_type: Literal["txt", "markdown"],
    raw_text: str,
    chunk_version: str = "chunk-v1",
    chunk_max_chars: int = 800,
    chunk_overlap_chars: int = 120,
) -> ChunkedDocumentResult:
    """Normalize and deterministically chunk a TXT or Markdown document version."""
    if chunk_max_chars < 1:
        raise ValueError("chunk_max_chars must be positive.")
    if chunk_overlap_chars < 0 or chunk_overlap_chars >= chunk_max_chars:
        raise ValueError("chunk_overlap_chars must be >= 0 and < chunk_max_chars.")

    normalized = normalize_document_text(raw_text, source_type)
    normalized_sha256 = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    heading_checkpoints = _build_heading_index(normalized, source_type)

    chunks: list[NormalizedChunk] = []
    start = 0
    text_len = len(normalized)

    while start < text_len:
        while start < text_len and normalized[start].isspace():
            start += 1
        if start >= text_len:
            break

        raw_end = _find_split_end(normalized, start, chunk_max_chars)
        chunk_start = start
        chunk_end = raw_end

        while chunk_end > chunk_start and normalized[chunk_end - 1].isspace():
            chunk_end -= 1

        if chunk_end > chunk_start:
            chunk_text = normalized[chunk_start:chunk_end]
            chunk_sha256 = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
            chunk_index = len(chunks)
            chunks.append(
                NormalizedChunk(
                    chunk_id=deterministic_chunk_id(
                        chunk_version=chunk_version,
                        document_version_id=document_version_id,
                        chunk_index=chunk_index,
                        content_sha256=chunk_sha256,
                    ),
                    chunk_index=chunk_index,
                    heading_path=_heading_path_at(heading_checkpoints, chunk_start),
                    char_start=chunk_start,
                    char_end=chunk_end,
                    char_count=len(chunk_text),
                    content_sha256=chunk_sha256,
                    chunk_text=chunk_text,
                )
            )

        if raw_end >= text_len:
            break

        start = _advance_next_start(normalized, start, raw_end, chunk_overlap_chars)

    return ChunkedDocumentResult(
        chunk_version=chunk_version,
        chunk_max_chars=chunk_max_chars,
        chunk_overlap_chars=chunk_overlap_chars,
        normalized_char_count=len(normalized),
        normalized_sha256=normalized_sha256,
        chunks=chunks,
    )

