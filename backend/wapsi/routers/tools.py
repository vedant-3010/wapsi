"""Bolna custom-function endpoints (SPEC §6–7). Every response is HTTP 200 with a `result` sentence."""

import json
import logging
import random
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException
from supabase import Client

from wapsi import guardrails, messages
from wapsi.actions import Actor, log_action, set_outcome
from wapsi.auth import require_tool_secret
from wapsi.config import Settings, get_settings
from wapsi.context import CallContext, resolve
from wapsi.db import first, get_db
from wapsi.messages import SAFE_RESULT
from wapsi.models import BookTechnicianRequest, EscalateRequest, GoodwillCreditRequest, ToolRequest, ToolResponse
from wapsi.util import days_since, format_day, utc_now

logger = logging.getLogger(__name__)


class SafeToolRoute(APIRoute):
    """Safety net for SPEC §7: a malformed body (422) or an uncaught error (500) becomes HTTP 200.
    Also logs exactly what Bolna sent (minus the Authorization header), and leaves empty fields out of
    replies so the LLM sees only what is set."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs["response_model_exclude_none"] = True
        super().__init__(*args, **kwargs)

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def safe_handler(request: Request) -> Response:
            body = await request.body()  # cached by Starlette, so the handler can read it again
            headers = {k: v for k, v in request.headers.items() if k.lower() != "authorization"}
            logger.info("Tool %s body=%s headers=%s", request.url.path, body.decode(errors="replace"), json.dumps(headers))
            try:
                return await handler(request)
            except HTTPException:
                raise  # deliberate errors, e.g. the 401 from the TOOL_SECRET check
            except Exception:
                logger.exception("Tool %s failed; returning the safe result", request.url.path)
                return JSONResponse({"result": SAFE_RESULT})

        return safe_handler


router = APIRouter(prefix="/api/tools", route_class=SafeToolRoute, dependencies=[Depends(require_tool_secret)])


def _context(db: Client, merchant_id: str | None) -> CallContext:
    ctx = resolve(db, merchant_id)
    if ctx is None:
        raise LookupError(f"No merchant for merchant_id={merchant_id!r} and no active call")
    if ctx.overruled:
        _guardrail(db, ctx, messages.other_merchant(ctx.merchant["name"]), {"named": ctx.overruled})
    return ctx


def _log(db: Client, ctx: CallContext, type: str, detail: str, payload: dict[str, Any] | None = None,
         actor: Actor = "agent") -> None:
    log_action(db, merchant_id=ctx.merchant_id, device_id=ctx.device_id, call_id=ctx.call_id,
               type=type, detail=detail, payload=payload, actor=actor)


def _guardrail(db: Client, ctx: CallContext, detail: str, payload: dict[str, Any] | None = None) -> None:
    """A check held back what the LLM asked for (wapsi/guardrails.py); the feed shows it, actor system."""
    _log(db, ctx, "guardrail", detail, payload, actor="system")


def _diagnose(db: Client, ctx: CallContext, settings: Settings, *, auto: bool = False) -> ToolResponse:
    device = ctx.device
    days_silent = days_since(device["last_announced_at"])
    result, detail = messages.diagnostics(device["fault"], device["rent_status"], days_silent, device["monthly_rent"])
    payload: dict[str, Any] = {"fault": device["fault"], "rent_status": device["rent_status"], "days_silent": days_silent}
    _log(db, ctx, "diagnostics", detail, {**payload, "auto": True} if auto else payload)
    return ToolResponse(result=result, next=messages.next_after_diagnostics(
        device["fault"], device["rent_status"], device["status"],
        messages.slot_options(settings.technician_slots), settings.goodwill_cap))


def _diagnose_first(db: Client, ctx: CallContext, settings: Settings) -> None:
    """Every fix rests on a finding: if the LLM skipped run_diagnostics on this call, run it now."""
    if ctx.call_id and not guardrails.done_on_call(db, ctx.call_id, "diagnostics"):
        _diagnose(db, ctx, settings, auto=True)


def _update_device(db: Client, ctx: CallContext, values: dict[str, Any]) -> None:
    db.table("devices").update({**values, "updated_at": utc_now().isoformat()}).eq("id", ctx.device_id).execute()


def _close_tickets(db: Client, merchant_id: str, ticket_type: str) -> bool:
    closed = (
        db.table("tickets").update({"status": "closed"})
        .eq("merchant_id", merchant_id).eq("type", ticket_type).eq("status", "open").execute()
    )
    return bool(closed.data)


@router.post("/diagnostics")
def diagnostics(
    body: ToolRequest,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ToolResponse:
    return _diagnose(db, _context(db, body.merchant_id), settings)


@router.post("/book-technician")
def book_technician(
    body: BookTechnicianRequest,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ToolResponse:
    ctx = _context(db, body.merchant_id)
    _diagnose_first(db, ctx, settings)
    labels = messages.slot_labels(settings.technician_slots)
    fault = ctx.device["fault"]

    booked = guardrails.open_booking(db, ctx.device)
    if booked:
        result, detail = messages.already_booked(booked["slot"], booked["booking_id"])
        _guardrail(db, ctx, detail, {"asked_slot": body.slot, **booked})
        return ToolResponse(result=result, next=messages.AFTER_BOOKING, booking_id=booked["booking_id"])
    if fault in ("no_network", "frozen"):  # a restart clears these, so the fault still being there means none yet
        result, detail = messages.restart_first(fault)
        _guardrail(db, ctx, detail, {"fault": fault})
        return ToolResponse(result=result, next=messages.RESTART_FIRST_NEXT)
    picked = guardrails.match_slot(body.slot, settings.technician_slots)
    if picked is None:
        slots = messages.slot_options(settings.technician_slots)
        result, detail = messages.slot_not_offered(slots)
        _guardrail(db, ctx, detail, {"asked_slot": body.slot, "offered": labels})
        return ToolResponse(result=result, next=messages.offer_slots(slots))

    slot = labels[picked]
    booking_id = f"TB-{random.randint(1000, 9999)}"
    if ctx.device["status"] != "recovered":
        _update_device(db, ctx, {"status": "fix_scheduled"})
    result, detail = messages.technician_booked(slot, booking_id, fault)
    _log(db, ctx, "technician_booked", detail, {"booking_id": booking_id, "slot": slot})
    set_outcome(db, ctx.call, "fix_scheduled")
    return ToolResponse(result=result, next=messages.AFTER_BOOKING, booking_id=booking_id)


@router.post("/resend-settlement")
def resend_settlement(body: ToolRequest, db: Client = Depends(get_db)) -> ToolResponse:
    ctx = _context(db, body.merchant_id)
    settlement = first(
        db.table("settlements").select("*").eq("merchant_id", ctx.merchant_id)
        .order("settled_on", desc=True).limit(1).execute()
    )
    if settlement is None:
        result, detail = messages.NO_SETTLEMENT
        _log(db, ctx, "statement_sent", detail)
        return ToolResponse(result=result)

    query_closed = _close_tickets(db, ctx.merchant_id, "settlement_query")
    if ctx.device["fault"] == "none" and ctx.device["status"] == "at_risk":
        _update_device(db, ctx, {"status": "awaiting_verification"})
    day = format_day(settlement["settled_on"])
    result, detail = messages.statement_sent(settlement["amount"], day, query_closed)
    _log(db, ctx, "statement_sent", detail, {"amount": settlement["amount"], "settled_on": settlement["settled_on"]})
    set_outcome(db, ctx.call, "statement_sent", only_if_empty=True)
    return ToolResponse(result=result)


@router.post("/escalate")
def escalate(
    body: EscalateRequest,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ToolResponse:
    ctx = _context(db, body.merchant_id)
    reason = (body.reason or "").strip().lower()[:40] or "unspecified"
    escalation = messages.ESCALATIONS.get(reason, messages.FALLBACK_ESCALATION)
    if guardrails.open_handoff(db, ctx.merchant_id, reason):
        _guardrail(db, ctx, messages.already_handed_off(escalation), {"reason": reason})
        return ToolResponse(result=escalation.result, next=messages.AFTER_ESCALATION)
    db.table("handoffs").insert({
        "call_id": ctx.call_id,
        "merchant_id": ctx.merchant_id,
        "reason": reason,
        "summary": guardrails.clean_summary(body.summary),
        "next_step": escalation.next_step,
    }).execute()
    if ctx.device["status"] in ("at_risk", "fix_scheduled"):
        _update_device(db, ctx, {"status": "handed_off"})
    _log(db, ctx, "escalated", messages.escalated_detail(escalation, settings.goodwill_cap), {"reason": reason})
    set_outcome(db, ctx.call, "handed_off")
    return ToolResponse(result=escalation.result, next=messages.AFTER_ESCALATION)


@router.post("/restart-device")
def restart_device(
    body: ToolRequest,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ToolResponse:
    ctx = _context(db, body.merchant_id)
    _diagnose_first(db, ctx, settings)
    fault = ctx.device["fault"]
    if fault in ("no_network", "frozen"):
        values: dict[str, Any] = {"fault": "none", "last_announced_at": utc_now().isoformat()}
        if ctx.device["status"] != "recovered":
            values["status"] = "awaiting_verification"
        _update_device(db, ctx, values)
        set_outcome(db, ctx.call, "fixed_live")
    result, detail = messages.restarted(fault)
    _log(db, ctx, "device_restarted", detail, {"fault_before": fault})
    if fault in ("no_network", "frozen"):
        return ToolResponse(result=result, next=messages.AFTER_RESTART)
    if fault == "speaker_fault":
        return ToolResponse(result=result, next=messages.offer_slots(messages.slot_options(settings.technician_slots)))
    return ToolResponse(result=result)


@router.post("/goodwill-credit")
def goodwill_credit(
    body: GoodwillCreditRequest,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ToolResponse:
    ctx = _context(db, body.merchant_id)
    _diagnose_first(db, ctx, settings)
    amount = body.amount if body.amount and body.amount > 0 else settings.goodwill_cap
    if amount > settings.goodwill_cap:
        result, detail = messages.credit_refused(amount, settings.goodwill_cap)
        _log(db, ctx, "credit_refused", detail, {"amount": amount, "cap": settings.goodwill_cap})
        return ToolResponse(result=result, next=messages.AFTER_CREDIT_REFUSED)
    given = guardrails.credit_this_month(db, ctx.merchant_id)
    if given:
        result, detail = messages.credit_already_given(given)
        _guardrail(db, ctx, detail, {"amount": amount, "given_this_month": given})
        return ToolResponse(result=result, next=messages.CREDIT_GIVEN_NEXT)

    values: dict[str, Any] = {"rent_status": "paid"}
    if ctx.device["fault"] == "none" and ctx.device["status"] == "at_risk":
        values["status"] = "awaiting_verification"
    _update_device(db, ctx, values)
    _close_tickets(db, ctx.merchant_id, "rent_dispute")
    result, detail = messages.credit_applied(amount)
    _log(db, ctx, "credit_applied", detail, {"amount": amount})
    set_outcome(db, ctx.call, "credit_applied")
    return ToolResponse(result=result)
