from fastapi.testclient import TestClient


def test_start_call_returns_call_shape(client: TestClient) -> None:
    response = client.post("/api/calls/start", json={"merchant_id": "M001"})
    assert response.status_code == 200
    assert set(response.json()) == {"call_id", "execution_id", "status"}
    assert response.json()["status"] == "queued"
