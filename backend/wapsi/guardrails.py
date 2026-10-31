"""Deterministic checks between the LLM's tool calls and our systems (SPEC §11).

The LLM proposes; these decide, from our own data and never from LLM judgement. A confused or
talked-round model can't book a slot we never offered, double-book, credit twice or skip the
diagnosis. When a check holds something back, the tool writes a `guardrail` feed row and tells the
agent what to do instead.
"""

import re
from typing import Any

from supabase import Client

from wapsi.db import first
from wapsi.util import IST, utc_now

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
# How merchants (and the LLM, translating them) name a slot: Hindi, Marathi and English.
_SECOND = ("second", "2nd", "dusra", "doosra", "dusri", "दूसरा", "दूसरी", "दुसरा", "दुसरी")
_FIRST = ("first", "1st", "pehla", "pehli", "पहला", "पहली", "पहिला", "पहिली")
_MORNING = ("morning", "subah", "sakal", "सुबह", "सकाळ")
_LATER = ("afternoon", "evening", "dopahar", "shaam", "दोपहर", "शाम", "दुपार", "संध्याकाळ")
_HOUR = re.compile(r"\b(\d{1,2})(?!\d)(?:[:.]\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?", re.IGNORECASE)
_SLOT_TIMES = re.compile(r"(\d{1,2})(?::\d{2})?\s*(AM|PM)", re.IGNORECASE)
# OTPs, card, account, Aadhaar and phone numbers: six or more digits, maybe split by spaces or dashes.
_LONG_NUMBER = re.compile(r"\+?\d(?:[\s-]?\d){5,}")


def _to_24h(hour: int, meridiem: str) -> int:
    pm = meridiem.lower().startswith("p")
    return hour % 12 + (12 if pm else 0)


def _window(slot: str) -> tuple[int, int] | None:
    """ "11 AM to 1 PM" → (11, 13), or None when the configured slot has no clear times."""
    times = _SLOT_TIMES.findall(slot)
    if len(times) < 2:
        return None
    return _to_24h(int(times[0][0]), times[0][1]), _to_24h(int(times[1][0]), times[1][1])


def match_slot(text: str | None, slots: list[str]) -> int | None:
    """Which offered slot (index into TECHNICIAN_SLOTS) the merchant picked. No text → the first one
    (SPEC §7). Text that names none of them → None, so nothing gets booked for a time we never offered."""
    if not slots:
        return None
    said = (text or "").strip().lower().translate(_DEVANAGARI_DIGITS)
    if not said or len(slots) == 1:
        return 0
    for i, slot in enumerate(slots):
        if slot.lower() in said:
            return i
    if any(word in said for word in _SECOND):
        return 1
    if any(word in said for word in _FIRST):
        return 0

    windows = [_window(slot) for slot in slots]
    hour = _HOUR.search(said)
    if hour:
        h, meridiem = int(hour.group(1)), hour.group(2)
        if meridiem and h <= 12:
            candidates = {_to_24h(h, meridiem)}
        else:
            candidates = {h, h + 12} if h < 12 else {h}  # "3 baje" can mean 3 PM
        for test in (lambda w, c: c == w[0], lambda w, c: w[0] <= c < w[1]):  # a start time beats "within"
            for i, window in enumerate(windows):
                if window and any(test(window, c) for c in candidates):
                    return i
        return None
    for words, wants_morning in ((_MORNING, True), (_LATER, False)):
        if any(word in said for word in words):
            for i, window in enumerate(windows):
                if window and (window[0] < 12) == wants_morning:
                    return i
    return None


def done_on_call(db: Client, call_id: str, action_type: str) -> bool:
    """Whether this call already has an action of this type (e.g. diagnostics before a fix)."""
    return bool(
        db.table("actions").select("id").eq("call_id", call_id).eq("type", action_type).limit(1).execute().data
    )


def open_booking(db: Client, device: dict[str, Any]) -> dict[str, Any] | None:
    """The technician booking behind a device that already has a fix scheduled (payload: booking_id, slot)."""
    if device["status"] != "fix_scheduled":
        return None
    booked = first(
        db.table("actions").select("*").eq("device_id", device["id"]).eq("type", "technician_booked")
        .order("created_at", desc=True).limit(1).execute()
    )
    return (booked or {}).get("payload") or None


def credit_this_month(db: Client, merchant_id: str) -> int:
    """₹ of goodwill credit already applied to this merchant this calendar month (IST). One credit a month."""
    month_start = utc_now().astimezone(IST).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db.table("actions").select("*").eq("merchant_id", merchant_id).eq("type", "credit_applied")
        .gte("created_at", month_start.isoformat()).execute().data
    )
    return sum(int((row.get("payload") or {}).get("amount") or 0) for row in rows)


def open_handoff(db: Client, merchant_id: str, reason: str) -> dict[str, Any] | None:
    return first(
        db.table("handoffs").select("*").eq("merchant_id", merchant_id).eq("reason", reason).eq("status", "open")
        .limit(1).execute()
    )


def clean_summary(text: str | None, limit: int = 280) -> str:
    """The LLM's handoff summary, safe to show the team: one line, no long numbers, at most `limit` characters."""
    said = _LONG_NUMBER.sub("[number removed]", " ".join((text or "").split()))
    if len(said) > limit:
        said = said[: limit - 1].rstrip() + "…"
    return said or "No summary given."
