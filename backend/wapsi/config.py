"""Backend settings, one field per env var in SETUP §4. Locally they load from backend/.env."""

from datetime import time
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_secret_key: str = ""
    bolna_api_key: str = ""
    bolna_agent_id: str = ""
    tool_secret: str = ""
    webhook_secret: str = ""
    allowed_numbers: Annotated[list[str], NoDecode] = []
    demo_default_phone: str = ""
    calling_hours: str = "09:00-21:00"
    call_dry_run: bool = True  # safe default: never place a real call unless told to
    goodwill_cap: int = 100
    holdout_recovery_rate: float = 0.1
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("allowed_numbers", "cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def calling_window(self) -> tuple[time, time]:
        """CALLING_HOURS ("09:00-21:00", IST) as (start, end)."""
        start, end = self.calling_hours.split("-")
        return time.fromisoformat(start.strip()), time.fromisoformat(end.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
