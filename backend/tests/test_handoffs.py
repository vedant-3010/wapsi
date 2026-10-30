from uuid import uuid4

from fastapi.testclient import TestClient


def test_take_handoff_returns_taken(client: TestClient) -> None:
    handoff_id = str(uuid4())
    response = client.post(f"/api/handoffs/{handoff_id}/take")
    assert response.status_code == 200
    assert response.json() == {"id": handoff_id, "status": "taken"}
