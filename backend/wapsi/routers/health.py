from fastapi import APIRouter, Depends

from wapsi import db
from wapsi.config import Settings, get_settings
from wapsi.models import BolnaStatus, HealthResponse

router = APIRouter()


def bolna_status(settings: Settings) -> BolnaStatus:
    if settings.call_dry_run:
        return "dry_run"
    return "configured" if settings.bolna_api_key and settings.bolna_agent_id else "not_configured"


@router.get("/api/health")
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(ok=True, db=db.ping(), bolna=bolna_status(settings))
