"""Bolna outbound-call client (SPEC §7 /api/calls/start). Stub until PLAN Phase 2."""

BOLNA_CALL_URL = "https://api.bolna.ai/call"


def start_call(recipient_phone: str, user_data: dict[str, str]) -> str:
    """POST the call to Bolna and return its execution_id."""
    raise NotImplementedError
