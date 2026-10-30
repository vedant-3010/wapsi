"""Bearer-token check for the tool endpoints (SPEC §7, 401 on a bad token)."""

import hmac

from fastapi import Depends, Header, HTTPException

from wapsi.config import Settings, get_settings


def require_tool_secret(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    # Accept "Bearer <secret>" (what Bolna sends) and a bare secret.
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not settings.tool_secret or not hmac.compare_digest(token.encode(), settings.tool_secret.encode()):
        raise HTTPException(status_code=401, detail="Bad or missing tool token")
