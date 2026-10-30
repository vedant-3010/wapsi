"""POST /api/bolna/webhook (F6). Stub until PLAN Phase 3."""

from fastapi import APIRouter, Query

from wapsi.models import BolnaExecution, WebhookResponse

router = APIRouter()


@router.post("/api/bolna/webhook")
def bolna_webhook(body: BolnaExecution, token: str = Query(default="")) -> WebhookResponse:
    # TODO(Phase 3): 403 on wrong token, update calls by execution id (never insert), terminal statuses.
    return WebhookResponse(matched=False)
