import pytest
from fastapi.testclient import TestClient

from wapsi import db
from wapsi.config import Settings
from wapsi.routers.health import bolna_status


def test_health_reports_db_and_bolna_mode(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "ping", lambda: "not_configured")
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "db": "not_configured", "bolna": "dry_run"}


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"call_dry_run": True}, "dry_run"),
        ({"call_dry_run": False, "bolna_api_key": "k", "bolna_agent_id": "a"}, "configured"),
        ({"call_dry_run": False, "bolna_api_key": "k"}, "not_configured"),
    ],
)
def test_bolna_status(overrides: dict[str, object], expected: str) -> None:
    assert bolna_status(Settings(_env_file=None, **overrides)) == expected


def test_public_config_has_guardrails_but_no_numbers(client: TestClient) -> None:
    assert client.get("/api/config").json() == {
        "dry_run": True,
        "calling_hours": "00:00-24:00",
        "within_calling_hours": True,
        "allowed_numbers": 1,
        "goodwill_cap": 100,
    }
