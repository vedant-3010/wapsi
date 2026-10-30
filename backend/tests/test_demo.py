from fastapi.testclient import TestClient

from main import app
from tests.fakedb import FakeDb
from wapsi.db import DbNotConfigured, get_db


def test_reset_demo_calls_seed_demo(client: TestClient, fake_db: FakeDb) -> None:
    response = client.post("/api/demo/reset")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert fake_db.rpc_calls == [("seed_demo", {})]


def test_reset_demo_without_supabase_is_503(client: TestClient) -> None:
    def not_configured() -> None:
        raise DbNotConfigured("missing keys")

    app.dependency_overrides[get_db] = not_configured
    response = client.post("/api/demo/reset")
    assert response.status_code == 503
    assert response.json() == {"detail": "Supabase is not configured on the backend"}
