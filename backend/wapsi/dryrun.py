"""Simulated calls (F20). With CALL_DRY_RUN on no phone rings, so the dashboard that started a dry run asks the
backend every few seconds to play the call Wapsi would have had. Each step runs the real tool code once, at a fixed
time after the call started, and the call ends through the same path as a real Bolna webhook."""

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from supabase import Client

from wapsi import messages
from wapsi.config import Settings
from wapsi.context import get_device, get_merchant, is_dry_run
from wapsi.db import first
from wapsi.guardrails import done_on_call
from wapsi.models import BolnaExecution, BookTechnicianRequest, GoodwillCreditRequest, SimulatedCallResponse, ToolRequest
from wapsi.routers import tools
from wapsi.routers.webhooks import apply_execution
from wapsi.util import parse_ts, utc_now

logger = logging.getLogger(__name__)

# Seconds after the call started → step, paced like a short real call.
STEPS: tuple[tuple[int, str], ...] = (
    (3, "answer"), (8, "diagnose"), (15, "fix"), (21, "test"), (27, "statement"), (33, "hang_up"),
)
ABANDONED_AFTER_S = 120  # matches the active-call grace (context.QUEUED_GRACE): too late to play


class NotDryRun(ValueError):
    pass


def _answer(db: Client, settings: Settings, call: dict[str, Any], merchant: ToolRequest, elapsed: float) -> None:
    if call["status"] == "queued":
        apply_execution(db, settings, BolnaExecution(id=call["bolna_execution_id"], status="in-progress"))


def _diagnose(db: Client, settings: Settings, call: dict[str, Any], merchant: ToolRequest, elapsed: float) -> None:
    if not done_on_call(db, call["id"], "diagnostics"):
        tools.diagnostics(merchant, db, settings)


def _fix(db: Client, settings: Settings, call: dict[str, Any], merchant: ToolRequest, elapsed: float) -> None:
    """The fix the diagnosis points to, as the agent's prompt asks (SPEC §8)."""
    device = get_device(db, call["merchant_id"]) or {}
    fault, rent = device.get("fault"), device.get("rent_status")
    if fault == "speaker_fault" and not done_on_call(db, call["id"], "technician_booked"):
        tools.book_technician(BookTechnicianRequest(merchant_id=merchant.merchant_id), db, settings)
    elif fault in ("no_network", "frozen") and not done_on_call(db, call["id"], "device_restarted"):
        tools.restart_device(merchant, db, settings)
    elif fault == "none" and rent == "failed" and not done_on_call(db, call["id"], "credit_applied"):
        tools.goodwill_credit(GoodwillCreditRequest(merchant_id=merchant.merchant_id), db, settings)


def _test(db: Client, settings: Settings, call: dict[str, Any], merchant: ToolRequest, elapsed: float) -> None:
    """After a remote restart the agent sends a test alert (F17)."""
    if done_on_call(db, call["id"], "device_restarted") and not done_on_call(db, call["id"], "soundbox_tested"):
        tools.test_soundbox(merchant, db, settings)


def _statement(db: Client, settings: Settings, call: dict[str, Any], merchant: ToolRequest, elapsed: float) -> None:
    if not done_on_call(db, call["id"], "statement_sent"):
        tools.resend_settlement(merchant, db)


def _hang_up(db: Client, settings: Settings, call: dict[str, Any], merchant: ToolRequest, elapsed: float) -> None:
    latest = first(db.table("calls").select("outcome").eq("id", call["id"]).limit(1).execute()) or {}
    name = (get_merchant(db, call["merchant_id"]) or {}).get("name", call["merchant_id"])
    apply_execution(db, settings, BolnaExecution(
        id=call["bolna_execution_id"], status="completed", conversation_duration=round(elapsed),
        summary=messages.simulated_summary(name, latest.get("outcome")),
    ))


_PLAY: dict[str, Callable[[Client, Settings, dict[str, Any], ToolRequest, float], None]] = {
    "answer": _answer, "diagnose": _diagnose, "fix": _fix, "test": _test, "statement": _statement, "hang_up": _hang_up,
}


def advance(db: Client, settings: Settings, call_id: str, now: datetime | None = None) -> SimulatedCallResponse:
    """Play every step that is due and not played yet. Raises LookupError (unknown call) or NotDryRun."""
    call = first(db.table("calls").select("*").eq("id", call_id).limit(1).execute())
    if call is None:
        raise LookupError(f"Unknown call {call_id}")
    if not is_dry_run(call):
        raise NotDryRun("Only a dry-run call can be simulated; this one rang a real phone")
    elapsed = ((now or utc_now()) - parse_ts(call["started_at"])).total_seconds()
    if call.get("ended_at") or elapsed > ABANDONED_AFTER_S:
        return SimulatedCallResponse(done=True)

    merchant = ToolRequest(merchant_id=call["merchant_id"])
    played = None
    for at, step in STEPS:
        if elapsed < at:
            break
        try:
            _PLAY[step](db, settings, call, merchant, elapsed)
        except Exception:
            logger.exception("Simulated call %s: step %s failed", call_id, step)
        played = step
    return SimulatedCallResponse(done=played == "hang_up", step=played)
