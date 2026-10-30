"""Which merchant a tool call is about (SPEC §7 context rule). Stub until PLAN 0.6."""

from dataclasses import dataclass


@dataclass(frozen=True)
class CallContext:
    merchant_id: str
    device_id: str | None
    call_id: str | None


def resolve(merchant_id: str | None) -> CallContext | None:
    """Use merchant_id if it exists, else the merchant on the most recent active call (SPEC §7)."""
    raise NotImplementedError
