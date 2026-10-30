"""POST /api/calls/start (F2): the per-row Call button, also the manual override."""

from fastapi import APIRouter, Depends
from supabase import Client

from wapsi import calling
from wapsi.config import Settings, get_settings
from wapsi.db import get_db
from wapsi.models import StartCallRequest, StartCallResponse

router = APIRouter()


@router.post("/api/calls/start")
def start_call(
    body: StartCallRequest,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StartCallResponse:
    return calling.start_call(
        db, settings, merchant_id=body.merchant_id.strip().upper(), phone=body.phone, bypass_hours=body.bypass_hours
    )
