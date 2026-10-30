"""POST /api/runs/start (F16): Wapsi picks the top at-risk merchant and calls, one call at a time."""

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from wapsi import calling
from wapsi.config import Settings, get_settings
from wapsi.context import active_call, get_merchant
from wapsi.db import first, get_db
from wapsi.models import StartRunRequest, StartRunResponse

router = APIRouter()


@router.post("/api/runs/start")
def start_run(
    body: StartRunRequest | None = None,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StartRunResponse:
    busy = active_call(db)
    if busy is not None:
        merchant = get_merchant(db, busy["merchant_id"])
        name = merchant["name"] if merchant else busy["merchant_id"]
        raise HTTPException(status_code=409, detail=f"Wapsi is already on a call with {name}")

    top = first(
        db.table("risk_queue").select("*")
        .eq("cohort", "wapsi").eq("status", "at_risk")
        .order("risk_score", desc=True).order("days_silent", desc=True)
        .limit(1).execute()
    )
    if top is None:
        raise HTTPException(status_code=404, detail="No at-risk merchant left to call")

    started = calling.start_call(
        db, settings, merchant_id=top["merchant_id"], bypass_hours=bool(body and body.bypass_hours), picked=top
    )
    return StartRunResponse(**started.model_dump(), merchant_id=top["merchant_id"], reason=top["reason"])
