import pytest
from fastapi.testclient import TestClient

from tests.fakedb import FakeDb
from wapsi.config import Settings
from wapsi.util import normalize_phone


@pytest.mark.parametrize(
    "raw",
    ["+919552330883", "+91 95523 30883", "+91-95523-30883", "919552330883", "9552330883", "09552330883",
     '"+919552330883"'],
)
def test_normalize_phone_gives_one_e164_form(raw: str) -> None:
    assert normalize_phone(raw) == "+919552330883"


def test_normalize_phone_keeps_other_countries_and_empty() -> None:
    assert normalize_phone("+1 415 555 0123") == "+14155550123"
    assert normalize_phone("") == ""


def test_allowlist_and_demo_phone_are_normalized() -> None:
    settings = Settings(_env_file=None, allowed_numbers="+91 95523 30883, 98765-43210", demo_default_phone="9552330883")
    assert settings.allowed_numbers == ["+919552330883", "+919876543210"]
    assert settings.demo_default_phone == "+919552330883"


def test_call_matches_the_allowlist_whatever_the_formatting(
    client: TestClient, settings: Settings, fake_db: FakeDb
) -> None:
    settings.allowed_numbers = ["+919552330883"]
    response = client.post("/api/calls/start", json={"merchant_id": "M001", "phone": "+91 95523-30883"})
    assert response.status_code == 200, response.text
    assert fake_db.tables["calls"][0]["phone"] == "+919552330883"


def test_a_different_number_is_still_refused(client: TestClient, settings: Settings) -> None:
    settings.allowed_numbers = ["+919552330883"]
    response = client.post("/api/calls/start", json={"merchant_id": "M001", "phone": "+91 95523 30884"})
    assert response.status_code == 403
