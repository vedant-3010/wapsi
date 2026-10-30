"""Which merchant a tool call is about (SPEC §7 context rule).

Use the merchant_id the LLM sent if it exists; otherwise fall back to the merchant on the active
call. Never fail because the LLM sent a bad ID.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from supabase import Client

from wapsi.db import first
from wapsi.util import utc_now

logger = logging.getLogger(__name__)

# SPEC §7 plus Bolna's other final states, so a call can't stay "active" forever.
TERMINAL_STATUSES = ("completed", "failed", "no-answer", "busy", "canceled", "error", "stopped", "balance-low")
ACTIVE_WINDOW = timedelta(minutes=15)


@dataclass(frozen=True)
class CallContext:
    merchant: dict[str, Any]
    device: dict[str, Any]
    call: dict[str, Any] | None

    @property
    def merchant_id(self) -> str:
        return str(self.merchant["id"])

    @property
    def device_id(self) -> str:
        return str(self.device["id"])

    @property
    def call_id(self) -> str | None:
        return self.call["id"] if self.call else None


def active_call(db: Client) -> dict[str, Any] | None:
    """The latest call that hasn't reached a final status, started in the last 15 minutes."""
    since = (utc_now() - ACTIVE_WINDOW).isoformat()
    return first(
        db.table("calls")
        .select("*")
        .not_.in_("status", list(TERMINAL_STATUSES))
        .gte("started_at", since)
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )


def get_merchant(db: Client, merchant_id: str) -> dict[str, Any] | None:
    return first(db.table("merchants").select("*").eq("id", merchant_id).limit(1).execute())


def get_device(db: Client, merchant_id: str) -> dict[str, Any] | None:
    return first(db.table("devices").select("*").eq("merchant_id", merchant_id).limit(1).execute())


def resolve(db: Client, merchant_id: str | None) -> CallContext | None:
    call = active_call(db)
    wanted = (merchant_id or "").strip().upper()
    merchant = get_merchant(db, wanted) if wanted else None
    if merchant is None and call is not None:
        if wanted:
            logger.warning("Unknown merchant_id %r; using the active call's merchant %s", wanted, call["merchant_id"])
        merchant = get_merchant(db, call["merchant_id"])
    if merchant is None:
        return None
    device = get_device(db, merchant["id"])
    if device is None:
        return None
    if call is not None and call["merchant_id"] != merchant["id"]:
        call = None  # the active call is about someone else
    return CallContext(merchant=merchant, device=device, call=call)
