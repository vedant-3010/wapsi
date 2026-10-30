from fastapi.testclient import TestClient

from tests.fakedb import FakeDb


def test_run_picks_top_wapsi_at_risk_merchant(client: TestClient, fake_db: FakeDb) -> None:
    # A holdout row and a fix_scheduled row that would otherwise rank first must be skipped.
    fake_db.tables["risk_queue"][-1].update(risk_score=90, days_silent=9)  # holdout F023
    fake_db.tables["risk_queue"].append({**fake_db.tables["risk_queue"][0], "merchant_id": "M003",
                                         "status": "fix_scheduled", "risk_score": 95})
    response = client.post("/api/runs/start", json={})
    assert response.status_code == 200
    body = response.json()
    assert (body["merchant_id"], body["reason"]) == ("M001", "Silent 4 days · QR −80%")

    picked, started = fake_db.tables["actions"]
    assert (picked["type"], started["type"]) == ("merchant_picked", "call_started")
    assert picked["detail"] == "Wapsi picked Sharma General Store: Silent 4 days · QR −80%"
    assert picked["call_id"] == started["call_id"] == body["call_id"]
    assert picked["actor"] == "system"


def test_run_accepts_no_body(client: TestClient) -> None:
    assert client.post("/api/runs/start").status_code == 200


def test_second_run_during_active_call_is_409(client: TestClient, fake_db: FakeDb) -> None:
    assert client.post("/api/runs/start", json={}).status_code == 200
    second = client.post("/api/runs/start", json={})
    assert second.status_code == 409
    assert second.json()["detail"] == "Wapsi is already on a call with Sharma General Store"
    assert len(fake_db.tables["calls"]) == 1


def test_backup_call_button_is_not_blocked_by_an_active_call(client: TestClient) -> None:
    assert client.post("/api/runs/start", json={}).status_code == 200
    assert client.post("/api/calls/start", json={"merchant_id": "M002"}).status_code == 200


def test_empty_queue_is_404(client: TestClient, fake_db: FakeDb) -> None:
    fake_db.tables["risk_queue"].clear()
    assert client.post("/api/runs/start", json={}).status_code == 404
