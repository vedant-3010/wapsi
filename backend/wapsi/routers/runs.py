"""POST /api/runs/start (F16). Stub until PLAN Phase 2."""

from fastapi import APIRouter

from wapsi.models import StartRunRequest, StartRunResponse
from wapsi.routers.calls import STUB_CALL_ID

router = APIRouter()


@router.post("/api/runs/start")
def start_run(body: StartRunRequest | None = None) -> StartRunResponse:
    # TODO(Phase 2): pick the top at_risk wapsi merchant from risk_queue, merchant_picked action,
    # then the same start-call function as /api/calls/start with DEMO_DEFAULT_PHONE.
    return StartRunResponse(
        call_id=STUB_CALL_ID,
        execution_id="dry-stub",
        status="queued",
        merchant_id="M001",
        reason="Silent 4 days · QR −80%",
    )
