"""The flagship story against a real Postgres + PostgREST with both migrations applied.

Skipped unless WAPSI_POSTGREST_URL points at a PostgREST whose anon role is service_role, e.g. a
local `postgrest/postgrest` container. This is what proves the real queries, not just the logic.
"""

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from postgrest import SyncPostgrestClient

from main import app
from tests.conftest import TOOL_AUTH
from wapsi.config import Settings, get_settings
from wapsi.db import get_db

URL = os.environ.get("WAPSI_POSTGREST_URL")
pytestmark = pytest.mark.skipif(not URL, reason="set WAPSI_POSTGREST_URL to run against a real PostgREST")

HOOK = "/api/bolna/webhook?token=test-hook"


@pytest.fixture
def real() -> Iterator[tuple[TestClient, SyncPostgrestClient]]:
    db = SyncPostgrestClient(str(URL))
    settings = Settings(_env_file=None, call_dry_run=True, tool_secret="test-tool", webhook_secret="test-hook",
                        allowed_numbers=["+919999999999"], demo_default_phone="+919999999999",
                        calling_hours="00:00-24:00")
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        assert client.post("/api/demo/reset").json() == {"ok": True}
        yield client, db
    app.dependency_overrides.clear()


def tool(client: TestClient, path: str, body: dict[str, object]) -> str:
    response = client.post(f"/api/tools/{path}", json=body, headers=TOOL_AUTH)
    assert response.status_code == 200, response.text
    return str(response.json()["result"])


def test_flagship(real: tuple[TestClient, SyncPostgrestClient]) -> None:
    client, db = real

    run = client.post("/api/runs/start", json={})
    assert run.status_code == 200, run.text
    assert (run.json()["merchant_id"], run.json()["reason"]) == ("M001", "Silent 4 days · QR −80%")
    assert client.post("/api/runs/start", json={}).status_code == 409  # one call at a time

    # Mid-call tools; the LLM sends a sloppy merchant_id, so context falls back to the active call.
    assert "speaker is not responding" in tool(client, "diagnostics", {"merchant_id": "sharma"})
    assert "Technician booked for tomorrow 3 PM to 5 PM" in tool(
        client, "book-technician", {"merchant_id": "M001", "slot": "tomorrow 3 PM to 5 PM"})
    assert tool(client, "resend-settlement", {"merchant_id": "M001"}).startswith("₹18,450 was settled on")

    finished = {"id": run.json()["execution_id"], "status": "completed", "conversation_duration": 95,
                "total_cost": 6.2, "transcript": "assistant: Namaste Ramesh ji\nuser: Haan"}
    for _ in range(2):  # duplicate delivery
        assert client.post(HOOK, json=finished).json() == {"ok": True, "matched": True}
    call = db.table("calls").select("*").eq("id", run.json()["call_id"]).execute().data[0]
    assert (call["status"], call["outcome"], call["duration_s"]) == ("completed", "fix_scheduled", 95)

    assert client.post("/api/simulate/next-day").json() == {"recovered": 1, "holdout_recovered": 2}
    device = db.table("devices").select("*").eq("id", "SB-M001").execute().data[0]
    assert device["status"] == "recovered"

    feed = db.table("actions").select("type,detail,actor").order("id").execute().data
    assert [a["type"] for a in feed] == ["merchant_picked", "call_started", "diagnostics", "technician_booked",
                                         "statement_sent", "call_ended", "technician_visited", "payments_resumed"]
    assert feed[0]["detail"] == "Wapsi picked Sharma General Store: Silent 4 days · QR −80%"
    assert feed[2]["detail"] == "Diagnostics: speaker fault → booking a technician (a remote restart can't fix hardware)"

    queue = db.table("risk_queue").select("merchant_id").execute().data
    assert "M001" not in {row["merchant_id"] for row in queue}

    # The next run moves on to the next merchant.
    assert client.post("/api/runs/start", json={}).json()["merchant_id"] == "M002"


def test_handoff_story(real: tuple[TestClient, SyncPostgrestClient]) -> None:
    client, db = real
    assert client.post("/api/calls/start", json={"merchant_id": "M005"}).status_code == 200  # backup Call button
    tool(client, "escalate", {"merchant_id": "M005", "reason": "hardship", "summary": "Bakery may close next month"})

    handoff = db.table("handoffs").select("*").eq("status", "open").execute().data[0]
    assert handoff["next_step"] == "Call back within 2 hours; offer rent pause"
    assert client.post(f"/api/handoffs/{handoff['id']}/take").json()["status"] == "taken"
    assert client.post(f"/api/handoffs/{handoff['id']}/take").status_code == 409
    taken = db.table("actions").select("*").eq("type", "human_takeover").execute().data
    assert taken[0]["actor"] == "human"


def test_restart_and_credit_tools(real: tuple[TestClient, SyncPostgrestClient]) -> None:
    client, db = real
    assert tool(client, "restart-device", {"merchant_id": "M002"}) == "Restart done. The device is back online."
    assert tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 500}).startswith("That is above my limit")
    assert tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 100}).startswith("₹100 credit applied")
    statuses = {d["id"]: d["status"] for d in db.table("devices").select("id,status").in_("id", ["SB-M002", "SB-M004"])
                .execute().data}
    assert statuses == {"SB-M002": "awaiting_verification", "SB-M004": "awaiting_verification"}
    tickets = db.table("tickets").select("status").eq("merchant_id", "M004").execute().data
    assert tickets == [{"status": "closed"}]
