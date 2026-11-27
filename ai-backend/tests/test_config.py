"""Configuration defaults, overrides, and invalid values."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from app.core.config import SERVICE_DIRECTORY, Settings


class SettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        environment_patch = patch.dict(os.environ, {}, clear=True)
        environment_patch.start()
        self.addCleanup(environment_patch.stop)

    def test_defaults(self) -> None:
        settings = Settings(_env_file=None)

        self.assertEqual(settings.app_name, "OnusAI AI Service")
        self.assertEqual(settings.log_level, "INFO")

    def test_environment_overrides_dotenv(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_file = Path(temporary_directory) / ".env"
            env_file.write_text(
                'AI_APP_NAME="Local AI Service"\nAI_LOG_LEVEL=WARNING\n',
                encoding="utf-8",
            )
            os.environ["AI_LOG_LEVEL"] = "DEBUG"

            settings = Settings(_env_file=env_file)

        self.assertEqual(settings.app_name, "Local AI Service")
        self.assertEqual(settings.log_level, "DEBUG")

    def test_invalid_environment_log_level_is_rejected(self) -> None:
        os.environ["AI_LOG_LEVEL"] = "invalid-test-value"

        with self.assertRaises(ValidationError) as raised:
            Settings(_env_file=None)

        self.assertNotIn("invalid-test-value", str(raised.exception))

    def test_blank_application_name_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, app_name="   ")

    def test_unprefixed_environment_variables_are_ignored(self) -> None:
        os.environ["APP_NAME"] = "Another service"
        os.environ["LOG_LEVEL"] = "DEBUG"

        settings = Settings(_env_file=None)

        self.assertEqual(settings.app_name, "OnusAI AI Service")
        self.assertEqual(settings.log_level, "INFO")

    def test_example_configuration_loads(self) -> None:
        settings = Settings(_env_file=SERVICE_DIRECTORY / ".env.example")

        self.assertEqual(settings, Settings(_env_file=None))
