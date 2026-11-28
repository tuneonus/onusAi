"""Tests for versioned text normalization, deterministic chunking, and config validation."""

import unittest

from pydantic import ValidationError

from app.core.config import Settings
from app.modules.ingestion.chunker import (
    chunk_document_text,
    normalize_document_text,
)

TEST_SECRET = "test-internal-auth-secret-at-least-32-characters"


class ChunkerTests(unittest.TestCase):
    def test_normalizes_line_endings_unicode_and_excess_blank_lines(self) -> None:
        # Decomposed 'e' + combining acute accent -> NFC 'é', plus Japanese & emoji
        raw = "\ufeff# Café Guide  \r\n\r\n\r\n\r\nMenu: Crème brûlée 🥐\r\n日本語テスト   \r\n"
        normalized = normalize_document_text(raw, "markdown")
        self.assertEqual(
            normalized,
            "# Café Guide\n\nMenu: Crème brûlée 🥐\n日本語テスト",
        )

    def test_markdown_heading_path_ignores_code_fences(self) -> None:
        md = (
            "# Handbook\n\n"
            "Intro paragraph.\n\n"
            "```python\n"
            "# Not a heading\n"
            "print('hi')\n"
            "```\n\n"
            "## Hours\n\n"
            "Open 9am to 5pm Monday through Friday. "
            "Weekend support is available by appointment only for priority accounts."
        )
        result = chunk_document_text(
            document_version_id="44444444-4444-4444-8444-444444444444",
            source_type="markdown",
            raw_text=md,
            chunk_version="chunk-v1",
            chunk_max_chars=110,
            chunk_overlap_chars=20,
        )
        self.assertGreaterEqual(len(result.chunks), 2)
        self.assertEqual(result.chunks[0].heading_path, ["Handbook"])
        self.assertEqual(result.chunks[-1].heading_path, ["Handbook", "Hours"])
        for chunk in result.chunks:
            self.assertNotIn("Not a heading", chunk.heading_path)

    def test_deterministic_chunk_ids_and_overlap_boundaries(self) -> None:
        text = "\n\n".join(
            f"Paragraph {i}: OnusSync provides multi-tenant knowledge grounding and deterministic workflows."
            for i in range(1, 8)
        )
        first = chunk_document_text(
            document_version_id="44444444-4444-4444-8444-444444444444",
            source_type="txt",
            raw_text=text,
            chunk_version="chunk-v1",
            chunk_max_chars=220,
            chunk_overlap_chars=40,
        )
        second = chunk_document_text(
            document_version_id="44444444-4444-4444-8444-444444444444",
            source_type="txt",
            raw_text=text,
            chunk_version="chunk-v1",
            chunk_max_chars=220,
            chunk_overlap_chars=40,
        )
        different_version = chunk_document_text(
            document_version_id="44444444-4444-4444-8444-444444444444",
            source_type="txt",
            raw_text=text,
            chunk_version="chunk-v2",
            chunk_max_chars=220,
            chunk_overlap_chars=40,
        )

        self.assertEqual(first, second)
        self.assertGreaterEqual(len(first.chunks), 3)
        self.assertNotEqual(first.chunks[0].chunk_id, different_version.chunks[0].chunk_id)

        normalized = normalize_document_text(text, "txt")
        for idx, chunk in enumerate(first.chunks):
            self.assertEqual(chunk.chunk_index, idx)
            self.assertLessEqual(chunk.char_count, 220)
            self.assertEqual(
                normalized[chunk.char_start : chunk.char_end],
                chunk.chunk_text,
            )
            if idx > 0:
                prev = first.chunks[idx - 1]
                self.assertGreater(chunk.char_start, prev.char_start)

    def test_chunk_config_validation_rejects_invalid_overlap_and_version(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(
                internal_auth_secret=TEST_SECRET,
                generation_mode="mock",
                chunk_max_chars=200,
                chunk_overlap_chars=200,
            )
        with self.assertRaises(ValidationError):
            Settings(
                internal_auth_secret=TEST_SECRET,
                generation_mode="mock",
                chunk_version="bad version!",
            )
