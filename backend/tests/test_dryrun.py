from datetime import timedelta

from fastapi.testclient import TestClient

from tests.conftest import start_dry_call
from tests.fakedb import FakeDb, now_iso
from wapsi import dryrun
from wapsi.config import Settings
from wapsi.util import parse_ts


def feed_types(db: FakeDb, call_id: str) -> list[str]:
    return [a["type"] for a in db.tables["actions"] if a["call_id"] == call_id]


def play(db: FakeDb, settings: Settings, call_id: str, seconds: float) -> dryrun.SimulatedCallResponse:
    started = parse_ts(db.one("calls", id=call_id)["started_at"])
    return dryrun.advance(db, settings, call_id, now=started + timedelta(seconds=seconds))


def test_a_dry_run_plays_the_flagship_call_to_the_end(client: TestClient, fake_db: FakeDb, settings: Settings) -> None:
    call_id = start_dry_call(client, "M001")
    assert play(fake_db, settings, call_id, 1).step is None  # nothing due yet
    assert play(fake_db, settings, call_id, 9).step == "diagnose"
    assert fake_db.one("calls", id=call_id)["status"] == "in-progress"

    finished = play(fake_db, settings, call_id, 40)
    assert (finished.done, finished.step) == (True, "hang_up")
    assert feed_types(fake_db, call_id) == ["call_started", "diagnostics", "technician_booked", "statement_sent", "call_ended"]
    call = fake_db.one("calls", id=call_id)
    assert (call["status"], call["outcome"]) == ("completed", "fix_scheduled")
    assert call["summary"] == ("Dry run, no phone rang. Wapsi played the call it would have had with"
                               " Sharma General Store: technician booked.")

    assert play(fake_db, settings, call_id, 45).done  # asking again changes nothing
    assert len(feed_types(fake_db, call_id)) == 5


def test_a_dry_run_on_a_device_with_no_signal_restarts_it_and_sends_a_test_alert(
    client: TestClient, fake_db: FakeDb, settings: Settings
) -> None:
    call_id = start_dry_call(client, "M002")
    play(fake_db, settings, call_id, 40)
    assert feed_types(fake_db, call_id) == [
        "call_started", "diagnostics", "device_restarted", "soundbox_tested", "statement_sent", "call_ended"]
    assert fake_db.one("actions", type="soundbox_tested")["payload"]["spoke"] is True


def test_only_dry_run_calls_can_be_simulated(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M001")
    fake_db.one("calls", id=call_id)["bolna_execution_id"] = "exec-real-1"  # a call that rang a phone
    assert client.post(f"/api/simulate/call/{call_id}").status_code == 409
    assert client.post("/api/simulate/call/no-such-call").status_code == 404


def test_the_endpoint_plays_only_what_is_due(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M001")
    response = client.post(f"/api/simulate/call/{call_id}")
    assert response.status_code == 200
    assert response.json() == {"done": False, "step": None}  # the call has only just started


def test_an_abandoned_dry_run_stops_blocking_and_is_not_played(
    client: TestClient, fake_db: FakeDb, settings: Settings
) -> None:
    call_id = start_dry_call(client, "M001")
    fake_db.one("calls", id=call_id).update(status="in-progress", started_at=now_iso(-timedelta(minutes=3)))
    assert client.post("/api/runs/start", json={}).status_code == 200  # the tab closed mid-simulation
    assert dryrun.advance(fake_db, settings, call_id).done
    assert feed_types(fake_db, call_id) == ["call_started"]
