"""POST /api/bolna/webhook (F6). Idempotent: it can arrive many times per call (SPEC §7)."""

import hmac
import logging
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from wapsi import followups, messages
from wapsi.actions import log_action, set_outcome
from wapsi.config import Settings, get_settings
from wapsi.context import TERMINAL_STATUSES
from wapsi.db import first, get_db
from wapsi.models import BolnaExecution, WebhookResponse
from wapsi.util import utc_now

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/bolna/webhook")
def bolna_webhook(
    body: BolnaExecution,
    token: str = Query(default=""),
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> WebhookResponse:
    if not settings.webhook_secret or not hmac.compare_digest(token.encode(), settings.webhook_secret.encode()):
        raise HTTPException(status_code=403, detail="Bad webhook token")

    call = first(db.table("calls").select("*").eq("bolna_execution_id", body.id).limit(1).execute())
    if call is None:
        # Never insert (merchant_id and phone are required); Bolna repeats webhooks, a later one will match.
        logger.warning("Webhook for unknown execution %s (status %s)", body.id, body.status)
        return WebhookResponse(matched=False)

    terminal = body.status in TERMINAL_STATUSES
    values: dict[str, Any] = {"raw": body.model_dump(mode="json")}
    if body.status and (terminal or not call.get("ended_at")):  # a late "in-progress" can't reopen a call
        values["status"] = body.status
    if body.conversation_duration is not None:
        values["duration_s"] = round(body.conversation_duration)
    if body.total_cost is not None:
        values["cost_cents"] = body.total_cost
    if body.transcript:
        values["transcript"] = body.transcript
    if body.summary:
        values["summary"] = body.summary
    db.table("calls").update(values).eq("id", call["id"]).execute()

    if terminal:
        # Only the first terminal delivery gets here past the `ended_at is null` guard.
        ended = (
            db.table("calls").update({"ended_at": utc_now().isoformat()})
            .eq("id", call["id"]).is_("ended_at", "null").execute()
        )
        if ended.data:
            missed = not body.conversation_duration
            if missed:
                set_outcome(db, call, "no_answer", only_if_empty=True)
            log_action(db, merchant_id=call["merchant_id"], device_id=call.get("device_id"), call_id=call["id"],
                       actor="system", type="call_ended",
                       detail=messages.call_ended(body.status or "", body.conversation_duration, call.get("outcome")),
                       payload={"status": body.status, "duration_s": values.get("duration_s")})
            if missed and body.status in followups.MISSED_STATUSES:
                _safely(followups.on_missed_call, db, settings, call)

    # Extractions can arrive with any delivery, often after "completed"; on_extractions acts once per call.
    if body.extracted_data:
        _safely(followups.on_extractions, db, call, body.extracted_data)
    return WebhookResponse(matched=True)


def _safely(step: Callable[..., None], *args: Any) -> None:
    """A follow-up must never fail the webhook: Bolna would only resend what's already saved."""
    try:
        step(*args)
    except Exception:
        logger.exception("Follow-up %s failed", step.__name__)
