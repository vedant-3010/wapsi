from fastapi.testclient import TestClient

from tests.conftest import TOOL_AUTH
from tests.fakedb import FakeDb
from wapsi.util import today


def test_flagship_next_day_verifies_the_save(client: TestClient, fake_db: FakeDb) -> None:
    client.post("/api/tools/book-technician", json={"merchant_id": "M001"}, headers=TOOL_AUTH)

    response = client.post("/api/simulate/next-day")
    assert response.status_code == 200
    assert response.json() == {"recovered": 1, "holdout_recovered": 0}  # 2 holdout × 0.1 rounds to 0

    device = fake_db.one("devices", id="SB-M001")
    assert (device["status"], device["fault"]) == ("recovered", "none")
    volume = fake_db.one("daily_volume", device_id="SB-M001", day=today().isoformat())
    assert 40 <= volume["txn_count"] <= 50  # 90–110% of the 45/day baseline
    visited, resumed = fake_db.rows("actions", type="technician_visited") + fake_db.rows("actions", type="payments_resumed")
    assert visited["detail"].startswith("Technician visited Sharma General Store: speaker replaced →")
    assert resumed["detail"] == (
        f"Payments resumed at Sharma General Store: {volume['txn_count']} today, back to normal → verified save"
    )
    assert resumed["actor"] == "system"


def test_untouched_devices_stay_at_risk(client: TestClient, fake_db: FakeDb) -> None:
    client.post("/api/simulate/next-day")
    assert fake_db.one("devices", id="SB-M002")["status"] == "at_risk"


def test_holdout_recovers_lowest_ids_first(client: TestClient, fake_db: FakeDb) -> None:
    for n in range(30, 40):  # 12 holdout at-risk devices in total → round(1.2) = 1 recovers
        row = {**fake_db.tables["risk_queue"][-1], "device_id": f"SB-F{n:03d}", "merchant_id": f"F{n:03d}"}
        fake_db.tables["risk_queue"].append(row)
    assert client.post("/api/simulate/next-day").json()["holdout_recovered"] == 1
    assert fake_db.one("devices", id="SB-F010")["status"] == "recovered"
    assert fake_db.one("devices", id="SB-F023")["status"] == "at_risk"
