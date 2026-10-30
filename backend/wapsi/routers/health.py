from fastapi import APIRouter, Depends

from wapsi import db
from wapsi.calling import within_calling_hours
from wapsi.config import Settings, get_settings
from wapsi.models import BolnaStatus, HealthResponse, PublicConfig

router = APIRouter()


def bolna_status(settings: Settings) -> BolnaStatus:
    if settings.call_dry_run:
        return "dry_run"
    return "configured" if settings.bolna_api_key and settings.bolna_agent_id else "not_configured"


@router.get("/api/health")
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(ok=True, db=db.ping(), bolna=bolna_status(settings))


@router.get("/api/config")
def public_config(settings: Settings = Depends(get_settings)) -> PublicConfig:
    return PublicConfig(
        dry_run=settings.call_dry_run,
        calling_hours=settings.calling_hours,
        within_calling_hours=within_calling_hours(settings),
        allowed_numbers=len(settings.allowed_numbers),
        goodwill_cap=settings.goodwill_cap,
    )
