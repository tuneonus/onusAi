"""Configuration defaults, overrides, and invalid values."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from app.core.config import SERVICE_DIRECTORY, Settings

TEST_INTERNAL_SECRET = "test-internal-auth-secret-at-least-32-characters"
TEST_GEMINI_KEY = "test-gemini-api-key-123456"


class SettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        environment_patch = patch.dict(os.environ, {}, clear=True)
        environment_patch.start()
        self.addCleanup(environment_patch.stop)

    def test_defaults(self) -> None:
        settings = Settings(
            _env_file=None,
            internal_auth_secret=TEST_INTERNAL_SECRET,
            gemini_api_key=TEST_GEMINI_KEY,
        )

        self.assertEqual(settings.app_name, "OnusAI AI Service")
        self.assertEqual(settings.log_level, "INFO")
        self.assertEqual(
            settings.internal_auth_secret.get_secret_value(), TEST_INTERNAL_SECRET
        )
        self.assertEqual(settings.internal_auth_issuer, "onusai-backend")
        self.assertEqual(settings.internal_auth_audience, "onusai-ai-backend")
        self.assertEqual(settings.internal_auth_max_ttl_seconds, 300)
        self.assertEqual(settings.internal_auth_clock_skew_seconds, 0)
        self.assertEqual(settings.internal_max_request_bytes, 262_144)
        self.assertEqual(settings.internal_max_deadline_ms, 60_000)
        self.assertEqual(settings.generation_mode, "gemini")
        self.assertEqual(settings.gemini_model, "gemini-2.5-flash-lite")

    def test_mock_mode_allows_missing_gemini_key_while_gemini_mode_requires_it(
        self,
    ) -> None:
        mock_settings = Settings(
            _env_file=None,
            internal_auth_secret=TEST_INTERNAL_SECRET,
            generation_mode="mock",
        )
        self.assertEqual(mock_settings.generation_mode, "mock")
        self.assertIsNone(mock_settings.gemini_api_key)

        with self.assertRaises(ValidationError):
            Settings(
                _env_file=None,
                internal_auth_secret=TEST_INTERNAL_SECRET,
                generation_mode="gemini",
            )

    def test_invalid_gemini_key_and_model_are_rejected_safely(self) -> None:
        os.environ["AI_INTERNAL_AUTH_SECRET"] = TEST_INTERNAL_SECRET

        for bad_key in ("", "short", " private-key-padded "):
            with patch.dict(os.environ, {"AI_GEMINI_API_KEY": bad_key}):
                with self.assertRaises(ValidationError) as raised:
                    Settings(_env_file=None)
                self.assertNotIn("private-key-padded", str(raised.exception))

        os.environ["AI_GEMINI_API_KEY"] = TEST_GEMINI_KEY
        for bad_model in ("", "   ", "models/gemini-2.5-flash-lite", "gemini?key=x"):
            with patch.dict(os.environ, {"AI_GEMINI_MODEL": bad_model}):
                with self.assertRaises(ValidationError):
                    Settings(_env_file=None)

    def test_environment_overrides_dotenv(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_file = Path(temporary_directory) / ".env"
            env_file.write_text(
                (
                    'AI_APP_NAME="Local AI Service"\n'
                    "AI_LOG_LEVEL=WARNING\n"
                    f"AI_INTERNAL_AUTH_SECRET={TEST_INTERNAL_SECRET}\n"
                    f"AI_GEMINI_API_KEY={TEST_GEMINI_KEY}\n"
                ),
                encoding="utf-8",
            )
            os.environ["AI_LOG_LEVEL"] = "DEBUG"

            settings = Settings(_env_file=env_file)

        self.assertEqual(settings.app_name, "Local AI Service")
        self.assertEqual(settings.log_level, "DEBUG")

    def test_missing_or_invalid_internal_auth_secret_is_rejected_safely(self) -> None:
        os.environ["AI_GEMINI_API_KEY"] = TEST_GEMINI_KEY

        with self.assertRaises(ValidationError):
            Settings(_env_file=None)

        for invalid_secret in (
            "",
            "short-private-value",
            "x" * 31,
            f" {'private-value' * 3} ",
        ):
            os.environ["AI_INTERNAL_AUTH_SECRET"] = invalid_secret
            with self.assertRaises(ValidationError) as raised:
                Settings(_env_file=None)
            self.assertNotIn("private-value", str(raised.exception))

    def test_invalid_internal_auth_bounds_and_strings_are_rejected(self) -> None:
        os.environ["AI_INTERNAL_AUTH_SECRET"] = TEST_INTERNAL_SECRET
        os.environ["AI_GEMINI_API_KEY"] = TEST_GEMINI_KEY

        for field_name, invalid_values in (
            ("AI_INTERNAL_AUTH_ISSUER", ("", "   ", "x" * 101)),
            ("AI_INTERNAL_AUTH_AUDIENCE", ("", "   ", "x" * 101)),
            ("AI_INTERNAL_AUTH_MAX_TTL_SECONDS", ("0", "-1", "3601", "abc")),
            ("AI_INTERNAL_AUTH_CLOCK_SKEW_SECONDS", ("-1", "61", "abc")),
            ("AI_INTERNAL_MAX_REQUEST_BYTES", ("1023", "1048577", "abc")),
            ("AI_INTERNAL_MAX_DEADLINE_MS", ("99", "300001", "abc")),
        ):
            for value in invalid_values:
                with patch.dict(os.environ, {field_name: value}):
                    with self.assertRaises(ValidationError):
                        Settings(_env_file=None)

    def test_invalid_environment_log_level_is_rejected(self) -> None:
        os.environ["AI_INTERNAL_AUTH_SECRET"] = TEST_INTERNAL_SECRET
        os.environ["AI_GEMINI_API_KEY"] = TEST_GEMINI_KEY
        os.environ["AI_LOG_LEVEL"] = "invalid-test-value"

        with self.assertRaises(ValidationError) as raised:
            Settings(_env_file=None)

        self.assertNotIn("invalid-test-value", str(raised.exception))

    def test_blank_application_name_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(
                _env_file=None,
                app_name="   ",
                internal_auth_secret=TEST_INTERNAL_SECRET,
                gemini_api_key=TEST_GEMINI_KEY,
            )

    def test_unprefixed_environment_variables_are_ignored(self) -> None:
        os.environ["AI_INTERNAL_AUTH_SECRET"] = TEST_INTERNAL_SECRET
        os.environ["AI_GEMINI_API_KEY"] = TEST_GEMINI_KEY
        os.environ["APP_NAME"] = "Another service"
        os.environ["LOG_LEVEL"] = "DEBUG"

        settings = Settings(_env_file=None)

        self.assertEqual(settings.app_name, "OnusAI AI Service")
        self.assertEqual(settings.log_level, "INFO")

    def test_example_configuration_loads(self) -> None:
        settings = Settings(_env_file=SERVICE_DIRECTORY / ".env.example")

        self.assertEqual(settings.app_name, "OnusAI AI Service")
        self.assertEqual(settings.log_level, "INFO")
        self.assertEqual(settings.generation_mode, "gemini")
        self.assertEqual(settings.gemini_model, "gemini-2.5-flash-lite")
        self.assertIsNotNone(settings.gemini_api_key)
        self.assertGreaterEqual(
            len(settings.internal_auth_secret.get_secret_value()), 32
        )
