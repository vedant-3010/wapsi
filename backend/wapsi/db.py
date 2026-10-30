"""Supabase client, created on first use so the app starts (and tests run) without credentials."""

import logging
from functools import lru_cache
from typing import Literal

from supabase import Client, create_client

from wapsi.config import get_settings

logger = logging.getLogger(__name__)

DbStatus = Literal["ok", "error", "not_configured"]


class DbNotConfigured(RuntimeError):
    """SUPABASE_URL / SUPABASE_SECRET_KEY missing. main.py maps it to 503; tool routes turn it into a safe 200."""


def is_configured() -> bool:
    settings = get_settings()
    return bool(settings.supabase_url and settings.supabase_secret_key)


@lru_cache
def get_client() -> Client:
    if not is_configured():
        raise DbNotConfigured("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def get_db() -> Client:
    """FastAPI dependency for routes that use the database; tests override it with a fake."""
    return get_client()


def ping() -> DbStatus:
    """Cheap read used by /api/health."""
    if not is_configured():
        return "not_configured"
    try:
        get_client().table("merchants").select("id").limit(1).execute()
    except Exception:
        logger.exception("Supabase health check failed")
        return "error"
    return "ok"
