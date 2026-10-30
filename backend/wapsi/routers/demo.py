"""POST /api/demo/reset (F8): reseed everything relative to today (SPEC §5)."""

import logging

from fastapi import APIRouter, Depends
from supabase import Client

from wapsi.db import get_db
from wapsi.models import OkResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/demo/reset")
def reset_demo(db: Client = Depends(get_db)) -> OkResponse:
    db.rpc("seed_demo", {}).execute()
    logger.info("Demo reset: seed_demo() done")
    return OkResponse()
