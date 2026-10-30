from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from main import app
from tests.fakedb import FakeDb, seed_demo
from wapsi.config import Settings, get_settings
from wapsi.db import get_db

DEMO_PHONE = "+919999999999"
TOOL_AUTH = {"Authorization": "Bearer test-tool"}


@pytest.fixture
def settings() -> Settings:
    # Ignore any local backend/.env so tests never see real keys or place real calls.
    return Settings(
        _env_file=None,
        call_dry_run=True,
        tool_secret="test-tool",
        webhook_secret="test-hook",
        allowed_numbers=[DEMO_PHONE],
        demo_default_phone=DEMO_PHONE,
        calling_hours="00:00-24:00",
    )


@pytest.fixture
def fake_db() -> FakeDb:
    return seed_demo(FakeDb())


@pytest.fixture
def client(settings: Settings, fake_db: FakeDb) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_db] = lambda: fake_db  # never the real Supabase project
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def start_dry_call(client: TestClient, merchant_id: str = "M001") -> str:
    """Start a dry-run call so tools have an active call to fall back to; returns the call id."""
    response = client.post("/api/calls/start", json={"merchant_id": merchant_id})
    assert response.status_code == 200, response.text
    return response.json()["call_id"]
