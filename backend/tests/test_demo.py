from fastapi.testclient import TestClient


def test_reset_demo_returns_ok(client: TestClient) -> None:
    response = client.post("/api/demo/reset")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
