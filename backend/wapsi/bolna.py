"""Bolna outbound-call client (SPEC §7 /api/calls/start)."""

import logging

import httpx

from wapsi.config import Settings

logger = logging.getLogger(__name__)

BOLNA_CALL_URL = "https://api.bolna.ai/call"


class BolnaError(RuntimeError):
    pass


def start_call(settings: Settings, recipient_phone: str, user_data: dict[str, str]) -> str:
    """POST the call to Bolna and return its execution_id."""
    if not settings.bolna_api_key or not settings.bolna_agent_id:
        raise BolnaError("BOLNA_API_KEY and BOLNA_AGENT_ID must be set (or CALL_DRY_RUN=true)")
    try:
        response = httpx.post(
            BOLNA_CALL_URL,
            headers={"Authorization": f"Bearer {settings.bolna_api_key}"},
            json={
                "agent_id": settings.bolna_agent_id,
                "recipient_phone_number": recipient_phone,
                "user_data": user_data,
            },
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise BolnaError(f"request failed: {exc}") from exc
    if response.is_error:
        raise BolnaError(f"HTTP {response.status_code}: {response.text[:200]}")
    execution_id = response.json().get("execution_id")
    if not execution_id:
        raise BolnaError(f"no execution_id in the response: {response.text[:200]}")
    logger.info("Bolna call queued: %s", execution_id)
    return str(execution_id)
