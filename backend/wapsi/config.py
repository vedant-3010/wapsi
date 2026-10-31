"""Backend settings, one field per env var in SETUP §4. Locally they load from backend/.env."""

from datetime import time
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from wapsi.util import normalize_phone


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_secret_key: str = ""
    bolna_api_key: str = ""
    bolna_agent_id: str = ""
    # Optional agent per language, e.g. "mr=<agent id>"; others use BOLNA_AGENT_ID.
    bolna_agent_ids: Annotated[dict[str, str], NoDecode] = {}
    tool_secret: str = ""
    webhook_secret: str = ""
    allowed_numbers: Annotated[list[str], NoDecode] = []
    demo_default_phone: str = ""
    calling_hours: str = "09:00-21:00"
    call_dry_run: bool = True  # safe default: never place a real call unless told to
    goodwill_cap: int = 100
    holdout_recovery_rate: float = 0.1
    # The test alert Wapsi sends to a Soundbox mid-call (₹), and when a missed call is tried again.
    test_alert_amount: int = 1
    retry_after_minutes: int = 120
    max_retries: int = 2  # a day, per merchant
    # Technician windows the mocked field-service system offers for tomorrow (IST).
    technician_slots: Annotated[list[str], NoDecode] = ["11 AM to 1 PM", "3 PM to 5 PM"]
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # Sarvam Bulbul voices the virtual Soundbox (F9); without a key the dashboard uses the browser's voice.
    sarvam_api_key: str = ""
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_speaker: str = "priya"

    @field_validator("allowed_numbers", "cors_origins", "technician_slots", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("allowed_numbers", mode="after")
    @classmethod
    def _normalize_numbers(cls, value: list[str]) -> list[str]:
        return [normalize_phone(number) for number in value]

    @field_validator("demo_default_phone", mode="after")
    @classmethod
    def _normalize_demo_phone(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("bolna_agent_ids", mode="before")
    @classmethod
    def _parse_agent_ids(cls, value: object) -> object:
        if isinstance(value, str):
            pairs = (item.split("=", 1) for item in value.split(",") if "=" in item)
            return {lang.strip(): agent.strip() for lang, agent in pairs if agent.strip()}
        return value

    def agent_id_for(self, language: str) -> str:
        return self.bolna_agent_ids.get(language, self.bolna_agent_id)

    @property
    def calling_window(self) -> tuple[time, time]:
        """CALLING_HOURS ("09:00-21:00", IST) as (start, end); an end of "24:00" means midnight."""
        start, end = (part.strip() for part in self.calling_hours.split("-"))
        return time.fromisoformat(start), time.max if end == "24:00" else time.fromisoformat(end)


@lru_cache
def get_settings() -> Settings:
    return Settings()
