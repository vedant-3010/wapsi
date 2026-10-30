from fastapi.testclient import TestClient

from tests.fakedb import FakeDb

HOOK = "/api/bolna/webhook?token=test-hook"


def started_call(client: TestClient, fake_db: FakeDb) -> dict[str, object]:
    call_id = client.post("/api/calls/start", json={"merchant_id": "M001"}).json()["call_id"]
    return fake_db.one("calls", id=call_id)


def test_wrong_token_is_403(client: TestClient) -> None:
    assert client.post("/api/bolna/webhook?token=nope", json={"id": "x"}).status_code == 403


def test_unknown_execution_is_not_inserted(client: TestClient, fake_db: FakeDb) -> None:
    response = client.post(HOOK, json={"id": "test-exec-1", "status": "completed", "conversation_duration": 42})
    assert response.json() == {"ok": True, "matched": False}
    assert fake_db.tables["calls"] == []


def test_completed_call_saves_transcript_once(client: TestClient, fake_db: FakeDb) -> None:
    call = started_call(client, fake_db)
    payload = {"id": call["bolna_execution_id"], "status": "completed", "conversation_duration": 102.4,
               "total_cost": 7.5, "transcript": "assistant: Namaste\nuser: Haan", "summary": "Booked a technician."}
    for _ in range(3):  # Bolna repeats deliveries
        assert client.post(HOOK, json=payload).json() == {"ok": True, "matched": True}

    saved = fake_db.one("calls", id=call["id"])
    assert (saved["status"], saved["duration_s"], saved["cost_cents"]) == ("completed", 102, 7.5)
    assert saved["transcript"].startswith("assistant: Namaste") and saved["ended_at"]
    ended = fake_db.rows("actions", type="call_ended")
    assert len(ended) == 1
    assert ended[0]["detail"] == "Call ended after 1:42 → no action taken"


def test_progress_updates_keep_status_current(client: TestClient, fake_db: FakeDb) -> None:
    call = started_call(client, fake_db)
    client.post(HOOK, json={"id": call["bolna_execution_id"], "status": "in-progress"})
    assert fake_db.one("calls", id=call["id"])["status"] == "in-progress"
    assert fake_db.rows("actions", type="call_ended") == []


def test_no_answer_sets_outcome(client: TestClient, fake_db: FakeDb) -> None:
    call = started_call(client, fake_db)
    client.post(HOOK, json={"id": call["bolna_execution_id"], "status": "no-answer", "conversation_duration": 0})
    assert fake_db.one("calls", id=call["id"])["outcome"] == "no_answer"


def test_late_progress_update_does_not_reopen_a_call(client: TestClient, fake_db: FakeDb) -> None:
    call = started_call(client, fake_db)
    client.post(HOOK, json={"id": call["bolna_execution_id"], "status": "completed", "conversation_duration": 30})
    client.post(HOOK, json={"id": call["bolna_execution_id"], "status": "in-progress"})
    assert fake_db.one("calls", id=call["id"])["status"] == "completed"
