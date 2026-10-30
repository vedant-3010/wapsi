"""POST /api/handoffs/{id}/take (F10): a person takes over a handoff."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from wapsi import messages
from wapsi.actions import log_action
from wapsi.context import get_device, get_merchant
from wapsi.db import first, get_db
from wapsi.models import TakeHandoffResponse

router = APIRouter()


@router.post("/api/handoffs/{handoff_id}/take")
def take_handoff(handoff_id: UUID, db: Client = Depends(get_db)) -> TakeHandoffResponse:
    handoff = first(db.table("handoffs").select("*").eq("id", str(handoff_id)).limit(1).execute())
    if handoff is None:
        raise HTTPException(status_code=404, detail="Handoff not found")
    taken = (
        db.table("handoffs").update({"status": "taken"})
        .eq("id", str(handoff_id)).eq("status", "open").execute()
    )
    if not taken.data:
        raise HTTPException(status_code=409, detail=f"Handoff is already {handoff['status']}")

    merchant = get_merchant(db, handoff["merchant_id"])
    device = get_device(db, handoff["merchant_id"])
    escalation = messages.ESCALATIONS.get(handoff["reason"], messages.FALLBACK_ESCALATION)
    log_action(db, merchant_id=handoff["merchant_id"], device_id=device["id"] if device else None,
               call_id=handoff.get("call_id"), actor="human", type="human_takeover",
               detail=messages.human_takeover(merchant["name"] if merchant else handoff["merchant_id"],
                                              escalation, handoff.get("next_step")))
    return TakeHandoffResponse(id=str(handoff_id), status="taken")
