"""POST /api/simulate/next-day (F7). Stub until PLAN Phase 5."""

from fastapi import APIRouter

from wapsi.models import SimulateResponse

router = APIRouter()


@router.post("/api/simulate/next-day")
def simulate_next_day() -> SimulateResponse:
    # TODO(Phase 5): SPEC §6 steps in order.
    return SimulateResponse(recovered=0, holdout_recovered=0)
