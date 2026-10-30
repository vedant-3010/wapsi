"""The one start-call path, shared by /api/calls/start and /api/runs/start (SPEC §7)."""

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from supabase import Client

from wapsi import bolna, messages
from wapsi.actions import log_action
from wapsi.config import Settings
from wapsi.context import get_device, get_merchant
from wapsi.db import first
from wapsi.messages import LANGUAGE_NAMES
from wapsi.models import StartCallResponse
from wapsi.util import IST, days_since, format_day, format_inr, utc_now

logger = logging.getLogger(__name__)


def within_calling_hours(settings: Settings, now: datetime | None = None) -> bool:
    start, end = settings.calling_window
    return start <= (now or utc_now()).astimezone(IST).time() < end


def build_user_data(
    settings: Settings,
    call_id: str,
    merchant: dict[str, Any],
    device: dict[str, Any] | None,
    risk: dict[str, Any] | None,
    settlement: dict[str, Any] | None,
) -> dict[str, str]:
    """Variables for the Bolna welcome message and prompt (SPEC §8). Bolna wants every value as a string."""
    if risk is not None:
        days_silent = int(risk["days_silent"])
    else:
        days_silent = days_since(device["last_announced_at"]) if device else 0
    first_name = merchant["owner_name"].split()[0]
    return {
        "call_id": call_id,
        "merchant_id": merchant["id"],
        "device_id": device["id"] if device else "",
        "merchant_name": merchant["name"],
        "owner_name": merchant["owner_name"],
        "owner_first_name": first_name,
        "language_name": LANGUAGE_NAMES.get(merchant["language"], "Hindi"),
        "greeting": messages.greeting(merchant["language"], first_name),
        "reason": (risk or {}).get("reason") or "",
        "days_silent": str(days_silent),
        "last_settlement_amount": format_inr(settlement["amount"]) if settlement else "",
        "last_settlement_date": format_day(settlement["settled_on"]) if settlement else "",
        "slot_options": " or ".join(messages.slot_labels(settings.technician_slots)),
        "goodwill_cap": format_inr(settings.goodwill_cap),
    }


def start_call(
    db: Client,
    settings: Settings,
    *,
    merchant_id: str,
    phone: str | None = None,
    bypass_hours: bool = False,
    picked: dict[str, Any] | None = None,
) -> StartCallResponse:
    """Checks, calls row, feed actions, then Bolna (or a dry run). `picked` is the risk_queue row
    when Wapsi chose the merchant itself (F16); it adds the "Wapsi picked …" action."""
    phone = (phone or settings.demo_default_phone).replace(" ", "")
    if not phone:
        raise HTTPException(status_code=400, detail="No phone given and DEMO_DEFAULT_PHONE is not set")
    if phone not in settings.allowed_numbers:
        raise HTTPException(status_code=403, detail=f"{phone} is not on the allowlist")
    if not bypass_hours and not within_calling_hours(settings):
        raise HTTPException(status_code=409, detail=f"Outside calling hours ({settings.calling_hours} IST)")

    merchant = get_merchant(db, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=404, detail=f"Unknown merchant {merchant_id}")
    device = get_device(db, merchant_id)
    risk = picked or first(db.table("risk_queue").select("*").eq("merchant_id", merchant_id).limit(1).execute())
    settlement = first(
        db.table("settlements").select("*").eq("merchant_id", merchant_id)
        .order("settled_on", desc=True).limit(1).execute()
    )

    call = db.table("calls").insert(
        {"merchant_id": merchant_id, "device_id": device["id"] if device else None, "phone": phone}
    ).execute().data[0]
    feed = {"merchant_id": merchant_id, "actor": "system", "call_id": call["id"],
            "device_id": device["id"] if device else None}
    if picked is not None:
        log_action(db, type="merchant_picked", detail=f"Wapsi picked {merchant['name']}: {picked['reason']}",
                   payload={"risk_score": picked["risk_score"], "reason": picked["reason"]}, **feed)
    log_action(db, type="call_started", detail=f"Calling {merchant['name']}", **feed)

    user_data = build_user_data(settings, call["id"], merchant, device, risk, settlement)
    if settings.call_dry_run:
        execution_id = f"dry-{uuid4()}"
    else:
        try:
            execution_id = bolna.start_call(settings, phone, user_data, settings.agent_id_for(merchant["language"]))
        except bolna.BolnaError as exc:
            logger.error("Bolna could not start the call to %s: %s", merchant_id, exc)
            db.table("calls").update({"status": "error", "ended_at": utc_now().isoformat()}).eq("id", call["id"]).execute()
            log_action(db, type="call_ended",
                       detail=f"Call to {merchant['name']} could not start → try again (Bolna: {exc})", **feed)
            raise HTTPException(status_code=502, detail=f"Bolna could not start the call: {exc}") from exc

    db.table("calls").update({"bolna_execution_id": execution_id}).eq("id", call["id"]).execute()
    logger.info("Call %s to %s started (%s)", call["id"], merchant_id, execution_id)
    return StartCallResponse(call_id=call["id"], execution_id=execution_id, status="queued")
