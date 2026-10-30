from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from main import app
from wapsi.config import Settings, get_settings


@pytest.fixture
def settings() -> Settings:
    # Ignore any local backend/.env so tests never see real keys or place real calls.
    return Settings(_env_file=None, call_dry_run=True, tool_secret="test-tool", webhook_secret="test-hook")


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
