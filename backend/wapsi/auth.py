"""Bearer-token check for the tool endpoints (SPEC §7, 401 on a bad token). Stub until PLAN 0.6."""

from fastapi import Header


def require_tool_secret(authorization: str | None = Header(default=None)) -> None:
    """Raise 401 unless the header is `Bearer <TOOL_SECRET>`."""
    raise NotImplementedError
