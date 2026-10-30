import re

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TOOL_AUTH, start_dry_call
from tests.fakedb import FakeDb
from wapsi.config import Settings
from wapsi.messages import SAFE_RESULT
from wapsi.util import format_day


def tool(client: TestClient, path: str, body: dict[str, object]) -> dict[str, object]:
    response = client.post(f"/api/tools/{path}", json=body, headers=TOOL_AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def last_action(db: FakeDb) -> dict[str, object]:
    return db.tables["actions"][-1]


# Rules every tool shares


def test_missing_token_is_401(client: TestClient) -> None:
    assert client.post("/api/tools/diagnostics", json={"merchant_id": "M001"}).status_code == 401


def test_bare_token_is_accepted(client: TestClient) -> None:
    response = client.post("/api/tools/diagnostics", json={"merchant_id": "M001"},
                           headers={"Authorization": "test-tool"})
    assert response.status_code == 200


def test_malformed_body_gets_safe_result_not_422(client: TestClient) -> None:
    assert tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": "hundred"}) == {"result": SAFE_RESULT}


def test_invalid_json_gets_safe_result_not_422(client: TestClient) -> None:
    response = client.post("/api/tools/diagnostics", content=b"not json",
                           headers={**TOOL_AUTH, "Content-Type": "application/json"})
    assert response.status_code == 200
    assert response.json() == {"result": SAFE_RESULT}


def test_unknown_merchant_falls_back_to_active_call(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M001")
    result = tool(client, "diagnostics", {"merchant_id": "the shop"})
    assert "speaker" in str(result["result"])
    assert last_action(fake_db)["merchant_id"] == "M001"
    assert last_action(fake_db)["call_id"] == call_id


def test_unknown_merchant_without_active_call_gets_safe_result(client: TestClient) -> None:
    assert tool(client, "diagnostics", {"merchant_id": "M999"}) == {"result": SAFE_RESULT}


def test_merchant_id_is_normalised(client: TestClient, fake_db: FakeDb) -> None:
    tool(client, "diagnostics", {"merchant_id": " m001 "})
    assert last_action(fake_db)["merchant_id"] == "M001"


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("diagnostics", {"merchant_id": "M001"}),
        ("book-technician", {"merchant_id": "M001", "slot": "tomorrow 11 AM to 1 PM"}),
        ("resend-settlement", {"merchant_id": "M003"}),
        ("escalate", {"merchant_id": "M005", "reason": "hardship", "summary": "Shop may close"}),
        ("restart-device", {"merchant_id": "M002"}),
        ("goodwill-credit", {"merchant_id": "M004", "amount": 100}),
        ("goodwill-credit", {"merchant_id": "M004", "amount": 500}),
    ],
)
def test_every_feed_detail_states_decision_and_why(
    client: TestClient, fake_db: FakeDb, path: str, body: dict[str, object]
) -> None:
    tool(client, path, body)
    assert re.fullmatch(r"[^:]+: .+ → .+ \(.+\)", str(last_action(fake_db)["detail"]))


# One test per tool behaviour (SPEC §6–7)


def test_diagnostics_speaker_fault(client: TestClient, fake_db: FakeDb) -> None:
    result = tool(client, "diagnostics", {"merchant_id": "M001"})
    assert result["result"] == "The device is online but its speaker is not responding. It needs a technician visit."
    action = last_action(fake_db)
    assert action["type"] == "diagnostics"
    assert action["detail"] == "Diagnostics: speaker fault → booking a technician (a remote restart can't fix hardware)"
    assert fake_db.one("devices", id="SB-M001")["status"] == "at_risk"  # diagnostics only reads


def test_diagnostics_no_network_reports_days(client: TestClient) -> None:
    result = tool(client, "diagnostics", {"merchant_id": "M002"})
    assert result["result"] == "The device has sent no signal for 3 days. A remote restart may fix it."


def test_diagnostics_rent_failed(client: TestClient) -> None:
    result = tool(client, "diagnostics", {"merchant_id": "M004"})
    assert result["result"] == "The device is healthy. The last rent debit of ₹100 failed."


def test_book_technician(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M001")
    result = tool(client, "book-technician", {"merchant_id": "M001", "slot": "tomorrow 11 AM to 1 PM"})
    booking = str(result["booking_id"])
    assert re.fullmatch(r"TB-\d{4}", booking)
    assert result["result"] == f"Technician booked for tomorrow 11 AM to 1 PM. Booking {booking}."
    assert fake_db.one("devices", id="SB-M001")["status"] == "fix_scheduled"
    assert fake_db.one("calls", id=call_id)["outcome"] == "fix_scheduled"
    assert last_action(fake_db)["detail"] == (
        f"Technician: booked tomorrow 11 AM to 1 PM ({booking}) → fix scheduled (a speaker fault needs a visit)"
    )


def test_book_technician_defaults_to_the_first_configured_slot(client: TestClient, settings: Settings) -> None:
    settings.technician_slots = ["9 AM to 11 AM", "2 PM to 4 PM"]
    assert "tomorrow 9 AM to 11 AM" in str(tool(client, "book-technician", {"merchant_id": "M001"})["result"])


def test_resend_settlement_flagship(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M001")
    tool(client, "book-technician", {"merchant_id": "M001"})
    result = tool(client, "resend-settlement", {"merchant_id": "M001"})
    day = format_day(fake_db.one("settlements", merchant_id="M001")["settled_on"])
    assert result["result"] == f"₹18,450 was settled on {day}. The statement has been sent on WhatsApp."
    assert fake_db.one("devices", id="SB-M001")["status"] == "fix_scheduled"  # speaker fault: still needs the visit
    assert fake_db.one("calls", id=call_id)["outcome"] == "fix_scheduled"  # statement doesn't overwrite it


def test_resend_settlement_closes_query_and_awaits_verification(client: TestClient, fake_db: FakeDb) -> None:
    tool(client, "resend-settlement", {"merchant_id": "M003"})
    assert fake_db.one("tickets", merchant_id="M003")["status"] == "closed"
    assert fake_db.one("devices", id="SB-M003")["status"] == "awaiting_verification"
    assert ", query closed (proof the money arrived)" in str(last_action(fake_db)["detail"])


def test_escalate_hardship(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M005")
    result = tool(client, "escalate", {"merchant_id": "M005", "reason": "hardship", "summary": "Shop may close"})
    assert result["result"] == "A senior colleague will call you back within 2 hours."
    handoff = fake_db.one("handoffs", merchant_id="M005")
    assert handoff["next_step"] == "Call back within 2 hours; offer rent pause"
    assert handoff["call_id"] == call_id
    assert fake_db.one("devices", id="SB-M005")["status"] == "handed_off"
    assert fake_db.one("calls", id=call_id)["outcome"] == "handed_off"
    assert last_action(fake_db)["detail"] == (
        "Escalated: hardship → Call back within 2 hours; offer rent pause (a rent pause needs a human decision)"
    )


def test_escalate_unknown_reason_still_hands_off(client: TestClient, fake_db: FakeDb) -> None:
    result = tool(client, "escalate", {"merchant_id": "M005", "reason": "something else"})
    assert result["result"] == "A senior colleague will call you back today."
    assert fake_db.one("handoffs", merchant_id="M005")["next_step"] == "Senior callback today"


@pytest.mark.parametrize(
    ("reason", "promise"),
    [
        ("angry", "A senior colleague will call you back today."),
        ("fraud_kyc", "Our risk team will call you back."),
        ("fixes_failed", "A senior colleague will call you back today to send a replacement device."),
    ],
)
def test_escalation_promise_matches_the_next_step(client: TestClient, reason: str, promise: str) -> None:
    assert tool(client, "escalate", {"merchant_id": "M005", "reason": reason})["result"] == promise


def test_above_cap_reason_uses_the_configured_cap(client: TestClient, fake_db: FakeDb, settings: Settings) -> None:
    settings.goodwill_cap = 150
    tool(client, "escalate", {"merchant_id": "M004", "reason": "above_cap"})
    assert last_action(fake_db)["detail"].endswith("(the credit asked is above the ₹150 cap)")


def test_restart_fixes_no_network(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M002")
    assert tool(client, "restart-device", {"merchant_id": "M002"})["result"] == "Restart done. The device is back online."
    device = fake_db.one("devices", id="SB-M002")
    assert (device["fault"], device["status"]) == ("none", "awaiting_verification")
    assert fake_db.one("calls", id=call_id)["outcome"] == "fixed_live"


def test_restart_cannot_fix_speaker(client: TestClient, fake_db: FakeDb) -> None:
    assert "technician" in str(tool(client, "restart-device", {"merchant_id": "M001"})["result"])
    assert fake_db.one("devices", id="SB-M001")["fault"] == "speaker_fault"


def test_goodwill_credit_within_cap(client: TestClient, fake_db: FakeDb) -> None:
    assert tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 100})["result"] == (
        "₹100 credit applied to this month's rent."
    )
    device = fake_db.one("devices", id="SB-M004")
    assert (device["rent_status"], device["status"]) == ("paid", "awaiting_verification")
    assert fake_db.one("tickets", merchant_id="M004")["status"] == "closed"


def test_goodwill_credit_above_cap_is_refused(client: TestClient, fake_db: FakeDb) -> None:
    result = tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 500})
    assert result["result"] == "That is above my limit. I'll ask a senior to help."
    assert fake_db.one("devices", id="SB-M004")["rent_status"] == "failed"
    assert last_action(fake_db)["type"] == "credit_refused"
