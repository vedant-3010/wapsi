"""POST /api/calls/start (F2). Stub until PLAN Phase 2."""

from fastapi import APIRouter

from wapsi.models import StartCallRequest, StartCallResponse

router = APIRouter()

STUB_CALL_ID = "00000000-0000-0000-0000-000000000000"


@router.post("/api/calls/start")
def start_call(body: StartCallRequest) -> StartCallResponse:
    # TODO(Phase 2): allowlist + calling-hours checks, calls row, call_started action, Bolna or dry run.
    return StartCallResponse(call_id=STUB_CALL_ID, execution_id="dry-stub", status="queued")
