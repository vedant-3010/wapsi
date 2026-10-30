"""Request and response bodies (SPEC §7)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

# Dashboard-facing


BolnaStatus = Literal["configured", "dry_run", "not_configured"]


class HealthResponse(BaseModel):
    ok: bool
    db: Literal["ok", "error", "not_configured"]
    bolna: BolnaStatus


class PublicConfig(BaseModel):
    """Non-secret guardrails for the dashboard's Safety strip (F15). Never the numbers themselves."""

    dry_run: bool
    calling_hours: str
    within_calling_hours: bool
    allowed_numbers: int
    goodwill_cap: int


class StartCallRequest(BaseModel):
    merchant_id: str
    phone: str | None = None  # None → DEMO_DEFAULT_PHONE
    bypass_hours: bool = False


class StartCallResponse(BaseModel):
    call_id: str
    execution_id: str
    status: str


class StartRunRequest(BaseModel):
    bypass_hours: bool = False


class StartRunResponse(StartCallResponse):
    merchant_id: str
    reason: str


class SimulateResponse(BaseModel):
    recovered: int
    holdout_recovered: int


class OkResponse(BaseModel):
    ok: bool = True


class TakeHandoffResponse(BaseModel):
    id: str
    status: Literal["taken"]


# Tool endpoints: every field is optional so a sloppy LLM payload never fails mid-call.


class ToolRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    merchant_id: str | None = None


class BookTechnicianRequest(ToolRequest):
    slot: str | None = None


class EscalateRequest(ToolRequest):
    reason: str | None = None
    summary: str | None = None


class GoodwillCreditRequest(ToolRequest):
    amount: int | None = None


class ToolResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    result: str


# Webhook


class BolnaExecution(BaseModel):
    """Bolna execution object; only the fields we read are typed (SPEC §7 Webhook)."""

    model_config = ConfigDict(extra="allow")

    id: str
    status: str | None = None
    conversation_duration: float | None = None
    total_cost: float | None = None
    transcript: str | None = None
    summary: str | None = None


class WebhookResponse(BaseModel):
    ok: bool = True
    matched: bool  # False when no calls row has this execution id (we never insert)
