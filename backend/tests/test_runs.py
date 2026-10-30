from fastapi.testclient import TestClient


def test_start_run_returns_call_shape_plus_pick(client: TestClient) -> None:
    response = client.post("/api/runs/start", json={})
    assert response.status_code == 200
    assert set(response.json()) == {"call_id", "execution_id", "status", "merchant_id", "reason"}
