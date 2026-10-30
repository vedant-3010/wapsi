"""POST /api/handoffs/{id}/take (F10). Stub until PLAN Phase 3."""

from uuid import UUID

from fastapi import APIRouter

from wapsi.models import TakeHandoffResponse

router = APIRouter()


@router.post("/api/handoffs/{handoff_id}/take")
def take_handoff(handoff_id: UUID) -> TakeHandoffResponse:
    # TODO(Phase 3): status taken, human_takeover action (actor human).
    return TakeHandoffResponse(id=str(handoff_id), status="taken")
