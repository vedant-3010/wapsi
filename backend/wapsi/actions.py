"""The `actions` table is the live feed: every state change writes one row (SPEC §11)."""

from typing import Any, Literal

from supabase import Client

Actor = Literal["agent", "human", "system"]


def log_action(
    db: Client,
    *,
    merchant_id: str,
    type: str,
    detail: str,
    actor: Actor = "agent",
    call_id: str | None = None,
    device_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    db.table("actions").insert(
        {
            "merchant_id": merchant_id,
            "type": type,
            "detail": detail,
            "actor": actor,
            "call_id": call_id,
            "device_id": device_id,
            "payload": payload or {},
        }
    ).execute()


def set_outcome(db: Client, call: dict[str, Any] | None, outcome: str, *, only_if_empty: bool = False) -> None:
    """Record what a call achieved. A handoff is never overwritten by a later, smaller outcome."""
    if call is None:
        return
    current = call.get("outcome")
    if (only_if_empty and current) or (current == "handed_off" and outcome != "handed_off"):
        return
    db.table("calls").update({"outcome": outcome}).eq("id", call["id"]).execute()
    call["outcome"] = outcome
