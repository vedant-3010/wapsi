"""Which merchant a tool call is about (SPEC §7 context rule).

Use the merchant_id the LLM sent if it exists. Mid-call, the merchant on the line wins: a bad ID, or a
real ID of a merchant nobody is talking to, falls back to the active call's merchant. Never fail
because the LLM sent a bad ID, and never act for a merchant who isn't on the call.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from supabase import Client

from wapsi.db import first
from wapsi.util import parse_ts, utc_now

logger = logging.getLogger(__name__)

# SPEC §7 plus Bolna's other final states, so a call can't stay "active" forever.
TERMINAL_STATUSES = ("completed", "failed", "no-answer", "busy", "canceled", "error", "stopped", "balance-low")
ACTIVE_WINDOW = timedelta(minutes=15)
# Bolna reports "initiated"/"ringing" within seconds. A call still "queued" after this never connected
# (a dry run, or webhooks not set up), so it must not block the next run for 15 minutes.
QUEUED_GRACE = timedelta(minutes=2)


@dataclass(frozen=True)
class CallContext:
    merchant: dict[str, Any]
    device: dict[str, Any]
    call: dict[str, Any] | None
    # A real merchant_id the LLM sent for someone not on any live call; we acted for the caller instead.
    overruled: str | None = None

    @property
    def merchant_id(self) -> str:
        return str(self.merchant["id"])

    @property
    def device_id(self) -> str:
        return str(self.device["id"])

    @property
    def call_id(self) -> str | None:
        return self.call["id"] if self.call else None


def active_calls(db: Client) -> list[dict[str, Any]]:
    """Calls that haven't reached a final status, started in the last 15 minutes, newest first."""
    now = utc_now()
    recent = (
        db.table("calls")
        .select("*")
        .not_.in_("status", list(TERMINAL_STATUSES))
        .gte("started_at", (now - ACTIVE_WINDOW).isoformat())
        .order("started_at", desc=True)
        .limit(5)
        .execute()
        .data
    )
    return [c for c in recent if not (c["status"] == "queued" and parse_ts(c["started_at"]) < now - QUEUED_GRACE)]


def active_call(db: Client) -> dict[str, Any] | None:
    """The latest active call."""
    calls = active_calls(db)
    return calls[0] if calls else None


def get_merchant(db: Client, merchant_id: str) -> dict[str, Any] | None:
    return first(db.table("merchants").select("*").eq("id", merchant_id).limit(1).execute())


def get_device(db: Client, merchant_id: str) -> dict[str, Any] | None:
    return first(db.table("devices").select("*").eq("merchant_id", merchant_id).limit(1).execute())


def resolve(db: Client, merchant_id: str | None) -> CallContext | None:
    calls = active_calls(db)
    wanted = (merchant_id or "").strip().upper()
    merchant = get_merchant(db, wanted) if wanted else None
    call = next((c for c in calls if merchant is not None and c["merchant_id"] == merchant["id"]), None)
    overruled = None
    if call is None and calls:
        # Mid-call, the person on the line wins: a bad ID falls back to them, and so does a real ID of a
        # merchant nobody is talking to (the LLM must not book a visit for a shop that isn't on the phone).
        call = calls[0]
        if merchant is not None:
            logger.warning("merchant_id %s is not on a live call; acting for %s instead", wanted, call["merchant_id"])
            overruled = merchant["id"]
        elif wanted:
            logger.warning("Unknown merchant_id %r; using the active call's merchant %s", wanted, call["merchant_id"])
        merchant = get_merchant(db, call["merchant_id"])
    if merchant is None:
        return None
    device = get_device(db, merchant["id"])
    if device is None:
        return None
    return CallContext(merchant=merchant, device=device, call=call, overruled=overruled)
