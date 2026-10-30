from fastapi.testclient import TestClient


def test_simulate_next_day_returns_counts(client: TestClient) -> None:
    response = client.post("/api/simulate/next-day")
    assert response.status_code == 200
    assert set(response.json()) == {"recovered", "holdout_recovered"}
