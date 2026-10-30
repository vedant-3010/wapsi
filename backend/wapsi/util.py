"""Time and money helpers shared by the routers."""

import math
from datetime import UTC, date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), "IST")


def utc_now() -> datetime:
    return datetime.now(UTC)


def today() -> date:
    """The database's `current_date`: Supabase runs in UTC, and the seed and risk_queue use it."""
    return utc_now().date()


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


def days_since(value: str, now: datetime | None = None) -> int:
    """Whole days since a timestamp, like risk_queue's days_silent."""
    return math.floor(((now or utc_now()) - parse_ts(value)).total_seconds() / 86400)


def format_inr(amount: int) -> str:
    """₹18,450 · ₹12,34,567 (Indian digit grouping)."""
    digits = str(abs(int(amount)))
    head, tail = digits[:-3], digits[-3:]
    groups: list[str] = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ("-" if amount < 0 else "") + "₹" + ",".join([*groups, tail])


def format_day(value: date | str) -> str:
    """26 Oct."""
    day = date.fromisoformat(value) if isinstance(value, str) else value
    return f"{day.day} {day.strftime('%b')}"
