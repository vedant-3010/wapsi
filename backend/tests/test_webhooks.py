from fastapi.testclient import TestClient


def test_webhook_accepts_execution_payload(client: TestClient) -> None:
    payload = {"id": "test-exec-1", "status": "completed", "conversation_duration": 42}
    response = client.post("/api/bolna/webhook?token=test-hook", json=payload)
    assert response.status_code == 200
    assert response.json() == {"ok": True, "matched": False}
