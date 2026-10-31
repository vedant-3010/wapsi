"""The virtual Soundbox's voice (F9). The dashboard falls back to the browser's voice on any error."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from wapsi import sarvam
from wapsi.config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/soundbox/announce", response_class=Response)
def announce(
    amount: Annotated[int, Query(ge=1, le=10_000_000)],
    lang: Literal["hi", "mr", "en"] = "hi",
    settings: Settings = Depends(get_settings),
) -> Response:
    if not settings.sarvam_api_key:
        raise HTTPException(status_code=503, detail="SARVAM_API_KEY is not set on the backend")
    try:
        audio = sarvam.announcement(settings, amount, lang)
    except sarvam.SarvamError as exc:
        logger.error("Sarvam could not voice ₹%s in %s: %s", amount, lang, exc)
        raise HTTPException(status_code=502, detail="Sarvam could not voice the announcement") from exc
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "public, max-age=86400"})
