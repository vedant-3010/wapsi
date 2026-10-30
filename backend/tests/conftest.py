from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from main import app
from wapsi.config import Settings, get_settings
from wapsi.db import get_db


class FakeQuery:
    def __init__(self, data: Any = None) -> None:
        self.data = data

    def execute(self) -> "FakeQuery":
        return self


class FakeDb:
    """Stands in for the Supabase client; records RPC calls. Extend as routes start using tables."""

    def __init__(self) -> None:
        self.rpc_calls: list[tuple[str, dict[str, Any] | None]] = []

    def rpc(self, fn: str, params: dict[str, Any] | None = None) -> FakeQuery:
        self.rpc_calls.append((fn, params))
        return FakeQuery()


@pytest.fixture
def settings() -> Settings:
    # Ignore any local backend/.env so tests never see real keys or place real calls.
    return Settings(_env_file=None, call_dry_run=True, tool_secret="test-tool", webhook_secret="test-hook")


@pytest.fixture
def fake_db() -> FakeDb:
    return FakeDb()


@pytest.fixture
def client(settings: Settings, fake_db: FakeDb) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_db] = lambda: fake_db  # never the real Supabase project
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
