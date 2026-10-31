"""The checks between the LLM and our systems (wapsi/guardrails.py, SPEC §11)."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import start_dry_call
from tests.fakedb import FakeDb
from tests.test_tools import last_action, tool
from wapsi.guardrails import clean_summary, match_slot

SLOTS = ["11 AM to 1 PM", "3 PM to 5 PM"]


def types(db: FakeDb) -> list[str]:
    return [str(a["type"]) for a in db.tables["actions"]]


# Only offered slots can be booked


@pytest.mark.parametrize(
    ("said", "picked"),
    [
        (None, 0),  # no slot → the first one (SPEC §7)
        ("", 0),
        ("tomorrow 11 AM to 1 PM", 0),
        ("tomorrow 3 PM to 5 PM", 1),
        ("kal 11 baje", 0),
        ("12 baje", 0),
        ("3 बजे", 1),
        ("दोपहर ३ बजे", 1),
        ("15:00", 1),
        ("4 PM", 1),
        ("second one", 1),
        ("दूसरा वाला", 1),
        ("पहला", 0),
        ("सुबह", 0),
        ("shaam ko", 1),
        ("उद्या सकाळी", 0),
    ],
)
def test_slot_matches_what_the_merchant_said(said: str | None, picked: int) -> None:
    assert match_slot(said, SLOTS) == picked


@pytest.mark.parametrize("said", ["Sunday 9 AM", "8 PM", "tomorrow", "next week", "kal raat"])
def test_slot_we_never_offered_matches_nothing(said: str) -> None:
    assert match_slot(said, SLOTS) is None


def test_one_offered_slot_is_always_the_pick() -> None:
    assert match_slot("whenever", ["11 AM to 1 PM"]) == 0


def test_unoffered_slot_is_not_booked(client: TestClient, fake_db: FakeDb) -> None:
    result = tool(client, "book-technician", {"merchant_id": "M001", "slot": "Sunday 9 AM"})
    assert result["result"] == ("That time isn't available. I can book tomorrow 11 AM to 1 PM"
                                " or tomorrow 3 PM to 5 PM. Which one suits you?")
    assert "book_technician" in str(result["next"])
    assert "booking_id" not in result
    assert fake_db.one("devices", id="SB-M001")["status"] == "at_risk"
    action = last_action(fake_db)
    assert (action["type"], action["actor"]) == ("guardrail", "system")
    assert "Sunday" not in str(action["detail"])  # LLM text stays out of the feed line
    assert action["payload"]["asked_slot"] == "Sunday 9 AM"


def test_merchant_words_book_the_matching_slot(client: TestClient, fake_db: FakeDb) -> None:
    result = tool(client, "book-technician", {"merchant_id": "M001", "slot": "दोपहर 3 बजे"})
    assert str(result["result"]).startswith("Technician booked for tomorrow 3 PM to 5 PM.")
    assert last_action(fake_db)["payload"]["slot"] == "tomorrow 3 PM to 5 PM"  # our label, not the LLM's words


# No double actions


def test_second_booking_keeps_the_first(client: TestClient, fake_db: FakeDb) -> None:
    first = tool(client, "book-technician", {"merchant_id": "M001", "slot": "tomorrow 11 AM to 1 PM"})
    again = tool(client, "book-technician", {"merchant_id": "M001", "slot": "tomorrow 3 PM to 5 PM"})
    assert again["booking_id"] == first["booking_id"]
    assert again["result"] == f"A technician is already booked for tomorrow 11 AM to 1 PM. Booking {first['booking_id']}."
    assert types(fake_db).count("technician_booked") == 1
    assert last_action(fake_db)["type"] == "guardrail"


def test_one_goodwill_credit_a_month(client: TestClient, fake_db: FakeDb) -> None:
    tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 100})
    again = tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 100})
    assert again["result"] == "A goodwill credit of ₹100 is already applied this month. That is the most I can give."
    assert "escalate_to_human" in str(again["next"])
    assert types(fake_db).count("credit_applied") == 1
    assert last_action(fake_db)["payload"] == {"amount": 100, "given_this_month": 100}


def test_small_credits_cannot_add_up_past_the_cap(client: TestClient, fake_db: FakeDb) -> None:
    tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 60})
    assert "already applied" in str(tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 40})["result"])
    assert types(fake_db).count("credit_applied") == 1


def test_above_cap_tells_the_agent_to_escalate(client: TestClient) -> None:
    refused = tool(client, "goodwill-credit", {"merchant_id": "M004", "amount": 500})
    assert refused["next"] == "Call escalate_to_human with reason above_cap."


def test_same_escalation_twice_keeps_one_handoff(client: TestClient, fake_db: FakeDb) -> None:
    body = {"merchant_id": "M005", "reason": "hardship", "summary": "Shop may close"}
    tool(client, "escalate", body)
    again = tool(client, "escalate", body)
    assert again["result"] == "A senior colleague will call you back within 2 hours."  # same promise
    assert len(fake_db.rows("handoffs", merchant_id="M005")) == 1
    assert last_action(fake_db)["type"] == "guardrail"


def test_a_different_escalation_reason_is_a_new_handoff(client: TestClient, fake_db: FakeDb) -> None:
    tool(client, "escalate", {"merchant_id": "M005", "reason": "hardship"})
    tool(client, "escalate", {"merchant_id": "M005", "reason": "fraud_kyc"})
    assert len(fake_db.rows("handoffs", merchant_id="M005")) == 2


# Cheapest fix first, and every fix rests on a diagnosis


def test_no_technician_before_a_remote_restart(client: TestClient, fake_db: FakeDb) -> None:
    held = tool(client, "book-technician", {"merchant_id": "M002", "slot": "tomorrow 11 AM to 1 PM"})
    assert held["next"] == "Call restart_device now. Book a technician only if the restart doesn't fix it."
    assert fake_db.one("devices", id="SB-M002")["status"] == "at_risk"
    assert last_action(fake_db)["detail"] == (
        "Guardrail: technician visit held → trying a remote restart first (no signal is usually fixed remotely)"
    )
    tool(client, "restart-device", {"merchant_id": "M002"})
    booked = tool(client, "book-technician", {"merchant_id": "M002", "slot": "tomorrow 11 AM to 1 PM"})
    assert str(booked["result"]).startswith("Technician booked")  # the merchant still wants a visit: fine


def test_fix_without_diagnosis_runs_diagnostics_first(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M001")
    tool(client, "book-technician", {"merchant_id": "M001"})
    assert types(fake_db)[-2:] == ["diagnostics", "technician_booked"]
    auto = fake_db.rows("actions", type="diagnostics")[0]
    assert (auto["call_id"], auto["payload"]["auto"]) == (call_id, True)


def test_diagnosis_already_made_is_not_repeated(client: TestClient, fake_db: FakeDb) -> None:
    start_dry_call(client, "M001")
    tool(client, "diagnostics", {"merchant_id": "M001"})
    tool(client, "book-technician", {"merchant_id": "M001"})
    assert types(fake_db).count("diagnostics") == 1


# Act only for the merchant on the line


def test_tool_naming_another_merchant_acts_for_the_caller(client: TestClient, fake_db: FakeDb) -> None:
    call_id = start_dry_call(client, "M001")
    result = tool(client, "book-technician", {"merchant_id": "M003", "slot": "tomorrow 11 AM to 1 PM"})
    assert str(result["result"]).startswith("Technician booked")
    assert fake_db.one("devices", id="SB-M001")["status"] == "fix_scheduled"
    assert fake_db.one("devices", id="SB-M003")["status"] == "at_risk"  # the shop that isn't on the phone
    guard = fake_db.rows("actions", type="guardrail")[0]
    assert (guard["merchant_id"], guard["call_id"], guard["payload"]) == ("M001", call_id, {"named": "M003"})
    assert guard["detail"].startswith("Guardrail: tool named another merchant → acted for Sharma General Store")


def test_merchant_with_its_own_live_call_is_respected(client: TestClient, fake_db: FakeDb) -> None:
    start_dry_call(client, "M001")
    other = start_dry_call(client, "M005")  # the per-row Call button can run a second call
    tool(client, "escalate", {"merchant_id": "M001", "reason": "angry"})
    assert fake_db.one("handoffs", merchant_id="M001")["call_id"] != other
    assert "guardrail" not in types(fake_db)


def test_without_a_live_call_the_named_merchant_is_used(client: TestClient, fake_db: FakeDb) -> None:
    tool(client, "diagnostics", {"merchant_id": "M003"})  # smoke tests and curl
    assert last_action(fake_db)["merchant_id"] == "M003"


# The agent is told what to do next


@pytest.mark.parametrize(
    ("merchant", "next_starts"),
    [
        ("M001", "Offer only these slots: tomorrow 11 AM to 1 PM or tomorrow 3 PM to 5 PM."),
        ("M002", "Call restart_device now"),
        ("M004", "Ask about the rent."),
        ("M003", "Ask what is wrong."),
    ],
)
def test_diagnostics_says_what_to_do_next(client: TestClient, merchant: str, next_starts: str) -> None:
    assert str(tool(client, "diagnostics", {"merchant_id": merchant})["next"]).startswith(next_starts)


def test_diagnostics_after_a_fix_says_it_works(client: TestClient) -> None:
    tool(client, "restart-device", {"merchant_id": "M002"})
    assert str(tool(client, "diagnostics", {"merchant_id": "M002"})["next"]).startswith("The device works now.")


def test_replies_without_a_next_step_leave_it_out(client: TestClient) -> None:
    assert "next" not in tool(client, "resend-settlement", {"merchant_id": "M003"})


# LLM text is cleaned before people see it


def test_summary_loses_long_numbers_and_newlines() -> None:
    said = "Merchant read out OTP 482 913 and card 4111-1111-1111-1111.\nWants ₹18,450 checked; call 98765 43210"
    assert clean_summary(said) == ("Merchant read out OTP [number removed] and card [number removed]."
                                   " Wants ₹18,450 checked; call [number removed]")


def test_summary_is_capped() -> None:
    assert len(clean_summary("word " * 200)) == 280
    assert clean_summary("   ") == "No summary given."


def test_handoff_stores_the_cleaned_summary(client: TestClient, fake_db: FakeDb) -> None:
    tool(client, "escalate", {"merchant_id": "M005", "reason": "fraud_kyc", "summary": "Says PIN is 123456"})
    assert fake_db.one("handoffs", merchant_id="M005")["summary"] == "Says PIN is [number removed]"
