from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TOOL_AUTH, start_dry_call
from tests.fakedb import FakeDb, now_iso
from wapsi import followups
from wapsi.config import Settings
from wapsi.util import IST

HOOK = "/api/bolna/webhook?token=test-hook"


def tool(client: TestClient, path: str, body: dict[str, object]) -> dict[str, object]:
    response = client.post(f"/api/tools/{path}", json=body, headers=TOOL_AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def missed_call(client: TestClient, fake_db: FakeDb, merchant_id: str = "M001") -> dict[str, object]:
    call_id = start_dry_call(client, merchant_id)
    call = fake_db.one("calls", id=call_id)
    client.post(HOOK, json={"id": call["bolna_execution_id"], "status": "no-answer", "conversation_duration": 0})
    return call


# F17: test alert


def test_test_alert_on_a_working_device_announces_and_changes_nothing(client: TestClient, fake_db: FakeDb) -> None:
    device_before = dict(fake_db.one("devices", merchant_id="M003"))
    reply = tool(client, "test-soundbox", {"merchant_id": "M003"})
    assert "1 rupee received" in str(reply["result"])
    assert "Ask if they heard the Soundbox" in str(reply["next"])
    action = fake_db.one("actions", type="soundbox_tested")
    assert action["payload"] == {"amount": 1, "delivered": True, "spoke": True, "fault": "none"}
    assert action["detail"] == "Test alert: sent over 4G → Soundbox announced ₹1 (the merchant hears the fix work)"
    assert fake_db.one("devices", merchant_id="M003") == device_before  # a test is not a payment


def test_test_alert_with_a_speaker_fault_is_delivered_but_silent(client: TestClient, fake_db: FakeDb) -> None:
    reply = tool(client, "test-soundbox", {"merchant_id": "M001"})
    assert "speaker stayed silent" in str(reply["result"])
    assert "Offer only these slots" in str(reply["next"])
    assert fake_db.one("actions", type="soundbox_tested")["payload"]["spoke"] is False


def test_test_alert_on_an_offline_device_asks_for_a_restart_then_works(client: TestClient, fake_db: FakeDb) -> None:
    start_dry_call(client, "M002")
    reply = tool(client, "test-soundbox", {"merchant_id": "M002"})
    assert "offline" in str(reply["result"]) and "restart_device" in str(reply["next"])
    assert "test_soundbox" in str(tool(client, "restart-device", {"merchant_id": "M002"})["next"])
    tool(client, "test-soundbox", {"merchant_id": "M002"})
    first, second = fake_db.rows("actions", type="soundbox_tested")
    assert (first["payload"]["delivered"], second["payload"]["spoke"]) == (False, True)


def test_test_alert_amount_comes_from_settings(client: TestClient, settings: Settings, fake_db: FakeDb) -> None:
    settings.test_alert_amount = 2
    assert "2 rupees received" in str(tool(client, "test-soundbox", {"merchant_id": "M003"})["result"])


# F18: missed calls


def test_missed_call_sends_whatsapp_and_schedules_one_retry(client: TestClient, fake_db: FakeDb) -> None:
    call = missed_call(client, fake_db)
    for _ in range(2):  # Bolna repeats deliveries
        client.post(HOOK, json={"id": call["bolna_execution_id"], "status": "no-answer", "conversation_duration": 0})
    whatsapp = fake_db.one("actions", type="whatsapp_sent")
    assert whatsapp["payload"]["mocked"] is True and "Ramesh" in whatsapp["payload"]["message"]
    assert whatsapp["detail"] == "WhatsApp: missed call → message sent in Hindi (so the merchant knows why we called)"
    retry = fake_db.one("actions", type="retry_scheduled")
    assert retry["detail"].startswith("Retry: no answer → calling again ")  # today, or tomorrow near midnight
    assert retry["payload"]["attempt"] == 1 and retry["call_id"] == call["id"]


def test_answered_or_errored_calls_get_no_follow_up(client: TestClient, fake_db: FakeDb) -> None:
    for status, duration in (("completed", 42), ("error", 0)):
        call_id = start_dry_call(client, "M001")
        execution = fake_db.one("calls", id=call_id)["bolna_execution_id"]
        client.post(HOOK, json={"id": execution, "status": status, "conversation_duration": duration})
    assert fake_db.rows("actions", type="whatsapp_sent") == [] and fake_db.rows("actions", type="retry_scheduled") == []


def test_retries_stop_at_the_daily_limit(client: TestClient, fake_db: FakeDb) -> None:
    for _ in range(3):
        missed_call(client, fake_db)
    retries = fake_db.rows("actions", type="retry_scheduled")
    assert [r["payload"]["attempt"] for r in retries] == [1, 2, 3]
    assert retries[-1]["detail"] == "Retry: no answer 3 times → no more calls today (2 retries is the daily limit)"
    assert len(fake_db.rows("actions", type="whatsapp_sent")) == 2


@pytest.mark.parametrize(
    ("ist", "expected", "same_window"),
    [((14, 15), (16, 15), True), ((20, 0), (9, 0), False), ((7, 30), (9, 30), True), ((5, 0), (9, 0), False)],
)
def test_retry_time_stays_inside_calling_hours(ist: tuple[int, int], expected: tuple[int, int], same_window: bool) -> None:
    settings = Settings(_env_file=None, calling_hours="09:00-21:00", retry_after_minutes=120)
    now = datetime(2026, 10, 31, *ist, tzinfo=IST).astimezone(UTC)
    at, inside = followups.retry_time(settings, now)
    assert ((at.hour, at.minute), inside) == (expected, same_window)
    assert at.date() == (now.astimezone(IST) + timedelta(days=1)).date() if ist == (20, 0) else True


def test_next_run_calls_back_a_due_retry_first(client: TestClient, fake_db: FakeDb) -> None:
    missed_call(client, fake_db, "M002")
    assert client.post("/api/runs/start", json={}).json()["merchant_id"] == "M001"  # not due yet

    for call in fake_db.tables["calls"]:
        call["status"] = "completed"  # end the run's call so the next run can start
    fake_db.one("actions", type="retry_scheduled")["payload"]["retry_at"] = now_iso(timedelta(minutes=-1))
    fake_db.tables["calls"] = [c for c in fake_db.tables["calls"] if c["merchant_id"] == "M002"]
    body = client.post("/api/runs/start", json={}).json()
    assert body["merchant_id"] == "M002" and body["reason"].startswith("Calling back after a missed call at ")
    assert fake_db.rows("actions", type="merchant_picked")[-1]["detail"].startswith(
        "Wapsi picked Patil Medical: Calling back after a missed call at ")

    for call in fake_db.tables["calls"]:
        call["status"] = "completed"
    assert client.post("/api/runs/start", json={}).json()["merchant_id"] == "M001"  # called back once only


# F19: mood


def mood(value: str, confidence: float = 0.9, reason: str = "Device down for 4 days, nobody came.") -> dict[str, object]:
    return {"Merchant": {"Mood": {"objective": value, "confidence": confidence},
                         "Mood reason": {"subjective": reason}}}


def finished_call(client: TestClient, fake_db: FakeDb, extracted: dict[str, object]) -> dict[str, object]:
    call = fake_db.one("calls", id=start_dry_call(client, "M001"))
    payload = {"id": call["bolna_execution_id"], "status": "completed", "conversation_duration": 70}
    client.post(HOOK, json=payload)
    for _ in range(2):  # extractions often come in a later delivery, and deliveries repeat
        client.post(HOOK, json={**payload, "extracted_data": extracted})
    return call


def test_upset_merchant_gets_a_senior_courtesy_callback(client: TestClient, fake_db: FakeDb) -> None:
    call = finished_call(client, fake_db, mood("Upset"))
    handoff = fake_db.one("handoffs", reason="upset_on_call")
    assert handoff["call_id"] == call["id"] and handoff["next_step"] == "Senior courtesy callback today"
    assert handoff["summary"] == "Device down for 4 days, nobody came."
    action = fake_db.one("actions", type="mood_detected")
    assert action["detail"] == "Mood: upset → senior courtesy callback (an upset merchant gets a person, not just a fix)"

    took = client.post(f"/api/handoffs/{handoff['id']}/take")
    assert took.status_code == 200
    assert "upset on the call" in fake_db.rows("actions", type="human_takeover")[-1]["detail"]


@pytest.mark.parametrize(("value", "confidence"), [("calm", 0.9), ("upset", 0.3)])
def test_calm_or_unsure_moods_are_logged_without_a_handoff(
    client: TestClient, fake_db: FakeDb, value: str, confidence: float
) -> None:
    finished_call(client, fake_db, mood(value, confidence))
    assert fake_db.rows("handoffs", reason="upset_on_call") == []
    assert fake_db.one("actions", type="mood_detected")["detail"].endswith("(the merchant wasn't upset)")


def test_unknown_or_missing_mood_is_ignored(client: TestClient, fake_db: FakeDb) -> None:
    finished_call(client, fake_db, {"Call Details": {"Call Reason": {"objective": "Billing"}}})
    assert fake_db.rows("actions", type="mood_detected") == []
