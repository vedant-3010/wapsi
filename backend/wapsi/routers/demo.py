"""POST /api/demo/reset (F8). Stub until PLAN 0.4."""

from fastapi import APIRouter

from wapsi.models import OkResponse

router = APIRouter()


@router.post("/api/demo/reset")
def reset_demo() -> OkResponse:
    # TODO(0.4): supabase.rpc("seed_demo").
    return OkResponse()
