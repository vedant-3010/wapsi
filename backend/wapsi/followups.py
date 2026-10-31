"""What Wapsi does on its own after a call (F18, F19): retry a missed merchant, and flag an upset one."""

import logging
from datetime import datetime, timedelta
from typing import Any

from supabase import Client

from wapsi import guardrails, messages
from wapsi.actions import log_action
from wapsi.config import Settings
from wapsi.context import get_merchant
from wapsi.db import first
from wapsi.util import IST, format_clock, parse_ts, utc_now

logger = logging.getLogger(__name__)

# Bolna statuses that mean nobody talked to us; error, canceled and balance-low are our side, not a miss.
MISSED_STATUSES = ("no-answer", "busy", "failed", "completed")
# The mood extraction set up in Bolna (scripts/bolna_agent.py): category → names.
MOOD_CATEGORY, MOOD_NAME, MOOD_REASON_NAME = "Merchant", "Mood", "Mood reason"
UPSET = ("upset", "angry")
MIN_CONFIDENCE = 0.6


def retry_time(settings: Settings, now: datetime) -> tuple[datetime, bool]:
    """When to call again: RETRY_AFTER_MINUTES later if that's inside CALLING_HOURS (IST), else the
    start of the next window. The flag says whether it stayed in the same window."""
    start, end = settings.calling_window
    at = (now + timedelta(minutes=settings.retry_after_minutes)).astimezone(IST)
    if start <= at.time() < end:
        return at, True
    day = at.date() if at.time() < start else at.date() + timedelta(days=1)
    return datetime.combine(day, start, tzinfo=IST), False


def on_missed_call(db: Client, settings: Settings, call: dict[str, Any], now: datetime | None = None) -> None:
    """Send the merchant a WhatsApp message (mocked) and schedule one more try, up to MAX_RETRIES a day."""
    now = now or utc_now()
    merchant = get_merchant(db, call["merchant_id"])
    if merchant is None:
        return
    feed = {"merchant_id": call["merchant_id"], "device_id": call.get("device_id"), "call_id": call["id"]}
    day_start = datetime.combine(now.astimezone(IST).date(), datetime.min.time(), tzinfo=IST)
    tries = len(
        db.table("actions").select("id").eq("merchant_id", call["merchant_id"]).eq("type", "retry_scheduled")
        .gte("created_at", day_start.isoformat()).execute().data
    )
    if tries >= settings.max_retries:
        log_action(db, type="retry_scheduled", actor="agent", detail=messages.retry_limit(tries + 1),
                   payload={"retry_at": None, "attempt": tries + 1}, **feed)
        return

    at, same_window = retry_time(settings, now)
    day = "today" if at.date() == now.astimezone(IST).date() else "tomorrow"
    time = format_clock(at)
    language = merchant.get("language", "hi")
    text = messages.whatsapp_message(language, merchant["owner_name"].split()[0], day, time)
    log_action(db, type="whatsapp_sent", actor="agent", detail=messages.whatsapp_sent(language),
               payload={"channel": "whatsapp", "mocked": True, "language": language, "message": text}, **feed)
    log_action(db, type="retry_scheduled", actor="agent",
               detail=messages.retry_scheduled(day, time, same_window, settings.retry_after_minutes),
               payload={"retry_at": at.isoformat(), "attempt": tries + 1}, **feed)


def due_retry(db: Client, now: datetime | None = None) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """The earliest missed merchant whose retry time has come and who hasn't been called since:
    (risk_queue row, retry action). The next run calls them before the top of the queue."""
    now = now or utc_now()
    retries = (
        db.table("actions").select("*").eq("type", "retry_scheduled")
        .order("created_at", desc=True).limit(20).execute().data
    )
    due = [r for r in retries if (r.get("payload") or {}).get("retry_at") and parse_ts(r["payload"]["retry_at"]) <= now]
    for retry in sorted(due, key=lambda r: r["payload"]["retry_at"]):
        called_since = (
            db.table("calls").select("id").eq("merchant_id", retry["merchant_id"])
            .gte("started_at", retry["created_at"]).limit(1).execute().data
        )
        if called_since:
            continue
        row = first(
            db.table("risk_queue").select("*").eq("merchant_id", retry["merchant_id"])
            .eq("cohort", "wapsi").eq("status", "at_risk").limit(1).execute()
        )
        if row:
            return row, retry
    return None


def _extraction(extracted: dict[str, Any], name: str) -> dict[str, Any]:
    """One extraction result, under our category or, failing that, any category."""
    category = extracted.get(MOOD_CATEGORY)
    if isinstance(category, dict) and isinstance(category.get(name), dict):
        return category[name]
    for group in extracted.values():
        if isinstance(group, dict) and isinstance(group.get(name), dict):
            return group[name]
    return {}


def on_extractions(db: Client, call: dict[str, Any], extracted: dict[str, Any]) -> None:
    """Log the merchant's mood once per call; an upset or angry merchant gets a senior courtesy callback."""
    mood_result = _extraction(extracted, MOOD_NAME)
    mood = str(mood_result.get("objective") or "").strip().lower()
    if mood not in ("calm", "confused", *UPSET) or guardrails.done_on_call(db, call["id"], "mood_detected"):
        return
    confidence = mood_result.get("confidence")
    reason = _extraction(extracted, MOOD_REASON_NAME).get("subjective")
    sure = not isinstance(confidence, (int, float)) or confidence >= MIN_CONFIDENCE
    flagged = mood in UPSET and sure and call.get("outcome") != "handed_off"
    if flagged and not guardrails.open_handoff(db, call["merchant_id"], messages.MOOD_REASON):
        escalation = messages.ESCALATIONS[messages.MOOD_REASON]
        db.table("handoffs").insert({
            "call_id": call["id"],
            "merchant_id": call["merchant_id"],
            "reason": messages.MOOD_REASON,
            "summary": guardrails.clean_summary(reason) or "The merchant sounded upset on the call.",
            "next_step": escalation.next_step,
        }).execute()
    log_action(db, merchant_id=call["merchant_id"], device_id=call.get("device_id"), call_id=call["id"],
               actor="system", type="mood_detected", detail=messages.mood_detected(mood, flagged),
               payload={"mood": mood, "confidence": confidence, "reason": guardrails.clean_summary(reason)})
    logger.info("Call %s mood %s (confidence %s, flagged %s)", call["id"], mood, confidence, flagged)
