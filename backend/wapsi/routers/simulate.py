"""POST /api/simulate/next-day (F7): technicians visit, payments resume, saves get verified (SPEC §6)."""

import random
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends
from supabase import Client

from wapsi import messages
from wapsi.actions import log_action
from wapsi.config import Settings, get_settings
from wapsi.db import get_db
from wapsi.models import SimulateResponse
from wapsi.util import today, utc_now

router = APIRouter()


def _names(db: Client, merchant_ids: list[str]) -> dict[str, str]:
    if not merchant_ids:
        return {}
    rows = db.table("merchants").select("id,name").in_("id", merchant_ids).execute().data
    return {row["id"]: row["name"] for row in rows}


def _baseline(db: Client, device_id: str) -> tuple[float, float]:
    """Average txns a day over days 4–31 before today (risk_queue's window), and ₹ per txn."""
    day = today()
    rows = (
        db.table("daily_volume").select("txn_count,amount").eq("device_id", device_id)
        .gte("day", (day - timedelta(days=31)).isoformat()).lte("day", (day - timedelta(days=4)).isoformat())
        .execute().data
    )
    txns = sum(row["txn_count"] for row in rows)
    if not rows or not txns:
        return 0.0, 0.0
    return txns / len(rows), sum(row["amount"] for row in rows) / txns


@router.post("/api/simulate/next-day")
def simulate_next_day(db: Client = Depends(get_db), settings: Settings = Depends(get_settings)) -> SimulateResponse:
    now = utc_now().isoformat()
    day = today()

    # 1. Technicians visit every fix_scheduled device: the fault is fixed, payments still to verify.
    scheduled: list[dict[str, Any]] = db.table("devices").select("*").eq("status", "fix_scheduled").execute().data
    names = _names(db, [d["merchant_id"] for d in scheduled])
    for device in scheduled:
        db.table("devices").update(
            {"fault": "none", "status": "awaiting_verification", "updated_at": now}
        ).eq("id", device["id"]).execute()
        log_action(db, merchant_id=device["merchant_id"], device_id=device["id"], actor="system",
                   type="technician_visited", detail=messages.technician_visited(names[device["merchant_id"]], device["fault"]))

    # 2. A save counts only when payments resume: today's volume must be ≥ 50% of baseline.
    waiting: list[dict[str, Any]] = db.table("devices").select("*").eq("status", "awaiting_verification").execute().data
    names = _names(db, [d["merchant_id"] for d in waiting])
    recovered = 0
    for device in waiting:
        baseline, per_txn = _baseline(db, device["id"])
        txns = round(baseline * random.Random(f"{device['id']}:{day}").uniform(0.9, 1.1))
        db.table("daily_volume").upsert(
            {"device_id": device["id"], "day": day.isoformat(), "txn_count": txns, "amount": round(txns * per_txn)},
            on_conflict="device_id,day",
        ).execute()
        if txns >= 0.5 * baseline:
            db.table("devices").update(
                {"status": "recovered", "last_announced_at": now, "updated_at": now}
            ).eq("id", device["id"]).execute()
            log_action(db, merchant_id=device["merchant_id"], device_id=device["id"], actor="system",
                       type="payments_resumed", detail=messages.payments_resumed(names[device["merchant_id"]], txns),
                       payload={"txn_count": txns, "baseline": round(baseline, 1)})
            recovered += 1

    # 3. The holdout recovers on its own at HOLDOUT_RECOVERY_RATE, lowest device ids first (no feed row).
    holdout = (
        db.table("risk_queue").select("device_id").eq("cohort", "holdout").eq("status", "at_risk")
        .order("device_id").execute().data
    )
    picked = [row["device_id"] for row in holdout[: int(len(holdout) * settings.holdout_recovery_rate + 0.5)]]
    if picked:
        db.table("devices").update(
            {"status": "recovered", "last_announced_at": now, "updated_at": now}
        ).in_("id", picked).execute()

    return SimulateResponse(recovered=recovered, holdout_recovered=len(picked))
