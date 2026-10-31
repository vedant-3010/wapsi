import pytest
from fastapi.testclient import TestClient

from tests.conftest import DEMO_PHONE
from tests.fakedb import FakeDb
from wapsi import bolna
from wapsi.config import Settings
from wapsi.util import format_day


def test_dry_run_call_creates_row_and_feed(client: TestClient, fake_db: FakeDb) -> None:
    response = client.post("/api/calls/start", json={"merchant_id": "M001"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["execution_id"].startswith("dry-")
    call = fake_db.one("calls", id=body["call_id"])
    assert (call["phone"], call["bolna_execution_id"], call["device_id"]) == (DEMO_PHONE, body["execution_id"], "SB-M001")
    action = fake_db.one("actions", type="call_started")
    assert (action["detail"], action["actor"], action["call_id"]) == ("Calling Sharma General Store", "system", call["id"])


def test_phone_outside_allowlist_is_403(client: TestClient, fake_db: FakeDb) -> None:
    response = client.post("/api/calls/start", json={"merchant_id": "M001", "phone": "+911111111111"})
    assert response.status_code == 403
    assert fake_db.tables["calls"] == []


def test_outside_calling_hours_is_409_unless_bypassed(client: TestClient, settings: Settings) -> None:
    settings.calling_hours = "00:00-00:00"  # an empty window: always outside
    assert client.post("/api/calls/start", json={"merchant_id": "M001"}).status_code == 409
    bypassed = client.post("/api/calls/start", json={"merchant_id": "M001", "bypass_hours": True})
    assert bypassed.status_code == 200


def test_unknown_merchant_is_404(client: TestClient) -> None:
    assert client.post("/api/calls/start", json={"merchant_id": "M999"}).status_code == 404


def test_live_call_sends_user_data_to_bolna(
    client: TestClient, fake_db: FakeDb, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: dict[str, object] = {}

    def fake_start(_: Settings, phone: str, user_data: dict[str, str], agent_id: str) -> str:
        sent.update(phone=phone, user_data=user_data, agent_id=agent_id)
        return "exec-123"

    monkeypatch.setattr(bolna, "start_call", fake_start)
    settings.call_dry_run = False
    settings.bolna_agent_id = "agent-default"
    body = client.post("/api/calls/start", json={"merchant_id": "M001"}).json()
    assert body["execution_id"] == "exec-123"
    day = format_day(fake_db.one("settlements", merchant_id="M001")["settled_on"])
    assert sent == {
        "phone": DEMO_PHONE,
        "agent_id": "agent-default",
        "user_data": {
            "call_id": body["call_id"], "merchant_id": "M001", "device_id": "SB-M001",
            "merchant_name": "Sharma General Store", "owner_name": "Ramesh Sharma", "owner_first_name": "Ramesh",
            "language_name": "Hindi",
            "greeting": "नमस्ते Ramesh जी! मैं Wapsi, Paytm merchant support का AI assistant बोल रहा हूँ। "
                        "आपके Soundbox में कुछ दिक्कत दिख रही है। क्या हुआ?",
            "reason": "Silent 4 days · QR −80%", "days_silent": "4",
            "last_settlement_amount": "₹18,450", "last_settlement_date": day,
            "slot_options": "tomorrow 11 AM to 1 PM or tomorrow 3 PM to 5 PM",
            "goodwill_cap": "₹100",
        },
    }


def test_marathi_merchant_uses_the_marathi_agent_and_greeting(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: dict[str, object] = {}

    def fake_start(_: Settings, phone: str, user_data: dict[str, str], agent_id: str) -> str:
        sent.update(agent_id=agent_id, user_data=user_data)
        return "exec-mr"

    monkeypatch.setattr(bolna, "start_call", fake_start)
    settings.call_dry_run = False
    settings.bolna_agent_id = "agent-default"
    settings.bolna_agent_ids = {"mr": "agent-marathi"}
    client.post("/api/calls/start", json={"merchant_id": "M002"})
    assert sent["agent_id"] == "agent-marathi"
    user_data = sent["user_data"]
    assert isinstance(user_data, dict)
    assert user_data["language_name"] == "Marathi"
    assert user_data["greeting"].startswith("नमस्कार Sunita जी!")


def test_bolna_failure_is_502_and_closes_the_call(
    client: TestClient, fake_db: FakeDb, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing(*_: object) -> str:
        raise bolna.BolnaError("HTTP 401: bad key")

    monkeypatch.setattr(bolna, "start_call", failing)
    settings.call_dry_run = False
    response = client.post("/api/calls/start", json={"merchant_id": "M001"})
    assert response.status_code == 502
    call = fake_db.tables["calls"][0]
    assert call["status"] == "error" and call["ended_at"]
    assert fake_db.tables["actions"][-1]["type"] == "call_ended"
