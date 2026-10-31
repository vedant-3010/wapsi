import base64
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from wapsi import sarvam
from wapsi.config import Settings


class FakeTts:
    """Stands in for SarvamAI().text_to_speech; never calls the real API."""

    def __init__(self, fail: bool = False) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = fail

    def convert(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError("Sarvam is down")
        return SimpleNamespace(request_id="req-1", audios=[base64.b64encode(b"RIFF-fake-wav").decode()])


@pytest.fixture
def tts(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeTts]:
    fake = FakeTts()
    settings.sarvam_api_key = "test-sarvam"
    monkeypatch.setattr(sarvam, "_client", lambda api_key: SimpleNamespace(text_to_speech=fake))
    sarvam._speak.cache_clear()
    yield fake
    sarvam._speak.cache_clear()


def test_announce_returns_sarvam_wav_in_the_merchants_language(client: TestClient, tts: FakeTts) -> None:
    response = client.get("/api/soundbox/announce", params={"amount": 180, "lang": "mr"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFF-fake-wav"
    assert tts.calls[0]["text"] == "Paytm वर 180 रुपये मिळाले"
    assert tts.calls[0]["language_code"] == "mr-IN"


def test_announce_caches_the_same_amount(client: TestClient, tts: FakeTts) -> None:
    for _ in range(2):
        assert client.get("/api/soundbox/announce", params={"amount": 250}).status_code == 200
    assert len(tts.calls) == 1
    assert tts.calls[0]["language_code"] == "hi-IN"


def test_announce_without_a_key_is_503(client: TestClient, settings: Settings) -> None:
    settings.sarvam_api_key = ""
    assert client.get("/api/soundbox/announce", params={"amount": 180}).status_code == 503


def test_announce_when_sarvam_fails_is_502(client: TestClient, tts: FakeTts) -> None:
    tts.fail = True
    assert client.get("/api/soundbox/announce", params={"amount": 180}).status_code == 502


@pytest.mark.parametrize("params", [{"amount": 0}, {"amount": 180, "lang": "ta"}, {}])
def test_announce_validates_amount_and_language(client: TestClient, tts: FakeTts, params: dict[str, Any]) -> None:
    assert client.get("/api/soundbox/announce", params=params).status_code == 422
    assert tts.calls == []
