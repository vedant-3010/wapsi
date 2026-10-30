from uuid import uuid4

from fastapi.testclient import TestClient

from tests.conftest import TOOL_AUTH
from tests.fakedb import FakeDb


def open_handoff(client: TestClient, fake_db: FakeDb) -> str:
    client.post("/api/tools/escalate", json={"merchant_id": "M005", "reason": "hardship", "summary": "Shop may close"},
                headers=TOOL_AUTH)
    return str(fake_db.one("handoffs", merchant_id="M005")["id"])


def test_take_over_marks_taken_and_logs_human_action(client: TestClient, fake_db: FakeDb) -> None:
    handoff_id = open_handoff(client, fake_db)
    response = client.post(f"/api/handoffs/{handoff_id}/take")
    assert response.json() == {"id": handoff_id, "status": "taken"}
    assert fake_db.one("handoffs", id=handoff_id)["status"] == "taken"
    action = fake_db.one("actions", type="human_takeover")
    assert action["actor"] == "human"
    assert action["detail"] == (
        "Taken over: Fernandes Bakery, hardship → Call back within 2 hours; offer rent pause (a person owns it now)"
    )


def test_second_take_over_is_409(client: TestClient, fake_db: FakeDb) -> None:
    handoff_id = open_handoff(client, fake_db)
    client.post(f"/api/handoffs/{handoff_id}/take")
    assert client.post(f"/api/handoffs/{handoff_id}/take").status_code == 409


def test_unknown_handoff_is_404(client: TestClient) -> None:
    assert client.post(f"/api/handoffs/{uuid4()}/take").status_code == 404
