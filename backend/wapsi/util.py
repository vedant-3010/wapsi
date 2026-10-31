"""Time, money and phone helpers shared by the routers."""

import math
import re
from datetime import UTC, date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), "IST")


def normalize_phone(phone: str) -> str:
    """E.164 for comparing numbers: "+91 95523-30883", "09552330883" and "9552330883" → "+919552330883"."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:  # an Indian mobile without the country code
        digits = "91" + digits
    return f"+{digits}" if digits else ""


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


def format_clock(value: datetime) -> str:
    """4:30 PM, in IST."""
    local = value.astimezone(IST)
    return f"{local.hour % 12 or 12}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'}"


def format_day(value: date | str) -> str:
    """26 Oct."""
    day = date.fromisoformat(value) if isinstance(value, str) else value
    return f"{day.day} {day.strftime('%b')}"
