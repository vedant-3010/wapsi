import pytest
from fastapi.testclient import TestClient

from wapsi.routers.tools import SAFE_RESULT


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("diagnostics", {"merchant_id": "M001"}),
        ("book-technician", {"merchant_id": "M001", "slot": "tomorrow 11 AM to 1 PM"}),
        ("resend-settlement", {"merchant_id": "M001"}),
        ("escalate", {"merchant_id": "M005", "reason": "hardship", "summary": "Shop may close"}),
        ("restart-device", {"merchant_id": "M002"}),
        ("goodwill-credit", {"merchant_id": "M004", "amount": 100}),
    ],
)
def test_tool_returns_result_sentence(client: TestClient, path: str, body: dict[str, object]) -> None:
    response = client.post(f"/api/tools/{path}", json=body)
    assert response.status_code == 200
    assert isinstance(response.json()["result"], str)


def test_malformed_body_gets_safe_result_not_422(client: TestClient) -> None:
    response = client.post("/api/tools/goodwill-credit", json={"merchant_id": "M004", "amount": "hundred"})
    assert response.status_code == 200
    assert response.json() == {"result": SAFE_RESULT}


def test_invalid_json_gets_safe_result_not_422(client: TestClient) -> None:
    response = client.post(
        "/api/tools/diagnostics", content=b"not json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 200
    assert response.json() == {"result": SAFE_RESULT}
