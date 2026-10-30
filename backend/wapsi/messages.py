"""What the agent says (`result`) and what the live feed shows (`detail`): SPEC §6–7.

Feed details follow `<Step>: <finding> → <decision> (<why>)` and are built only from these
templates, never from LLM text. `result` stays plain words for the merchant.
"""

from dataclasses import dataclass

from wapsi.util import format_inr

SAFE_RESULT = "I couldn't check that right now; a senior will call back."

LANGUAGE_NAMES = {"hi": "Hindi", "mr": "Marathi", "en": "English"}

DEFAULT_SLOT = "tomorrow 11 AM to 1 PM"


def diagnostics(fault: str, rent_status: str, days_silent: int, rent: int) -> tuple[str, str]:
    if fault == "speaker_fault":
        return (
            "The device is online but its speaker is not responding. It needs a technician visit.",
            "Diagnostics: speaker fault → booking a technician (a remote restart can't fix hardware)",
        )
    if fault == "no_network":
        return (
            f"The device has sent no signal for {days_silent} days. A remote restart may fix it.",
            f"Diagnostics: no signal for {days_silent} days → trying a remote restart"
            " (it usually brings the network back)",
        )
    if fault == "frozen":
        return (
            "The device is online but frozen. A remote restart should fix it.",
            "Diagnostics: device frozen → trying a remote restart (a software hang needs no visit)",
        )
    if rent_status == "failed":
        return (
            f"The device is healthy. The last rent debit of {format_inr(rent)} failed.",
            f"Diagnostics: device healthy, rent debit of {format_inr(rent)} failed → no device fix"
            " (the rent is the likely complaint)",
        )
    return (
        "The device is healthy: network and speaker are working.",
        "Diagnostics: device healthy → no device fix (network and speaker work; the cause is elsewhere)",
    )


_VISIT_WHY = {
    "speaker_fault": "a speaker fault needs a visit",
    "no_network": "the network fault needs a visit",
    "frozen": "the frozen device needs a visit",
}


def technician_booked(slot: str, booking_id: str, fault: str) -> tuple[str, str]:
    why = _VISIT_WHY.get(fault, "the merchant asked for a visit")
    return (
        f"Technician booked for {slot}. Booking {booking_id}.",
        f"Technician: booked {slot} ({booking_id}) → fix scheduled ({why})",
    )


def statement_sent(amount: int, day: str, query_closed: bool) -> tuple[str, str]:
    closed = ", query closed" if query_closed else ""
    return (
        f"{format_inr(amount)} was settled on {day}. The statement has been sent on WhatsApp.",
        f"Settlement: {format_inr(amount)} paid on {day} → statement sent on WhatsApp{closed}"
        " (proof the money arrived)",
    )


NO_SETTLEMENT = (
    "I can't see a recent settlement. A senior will check and call you back.",
    "Settlement: none found → senior to check (no record to send)",
)


@dataclass(frozen=True)
class Escalation:
    label: str
    next_step: str
    why: str


ESCALATIONS = {
    "hardship": Escalation("hardship", "Call back within 2 hours; offer rent pause", "a rent pause needs a human decision"),
    "angry": Escalation("angry", "Senior callback today", "still upset after one attempt to calm them"),
    "asked_for_person": Escalation("asked for a person", "Senior callback today", "the merchant asked for a person"),
    "above_cap": Escalation("credit above cap", "Approve or reject credit", "the credit asked is above the ₹100 cap"),
    "fraud_kyc": Escalation("fraud/KYC", "Route to risk team", "fraud and KYC go to the risk team only"),
    "fixes_failed": Escalation("fixes failed", "Send technician with replacement device", "two fixes did not work"),
}
# Unknown or missing reason from the LLM: still hand off, never fail.
FALLBACK_ESCALATION = Escalation("needs a human", "Senior callback today", "the agent could not resolve it")

ESCALATED_RESULT = "A senior colleague will call back within 2 hours."


def escalated_detail(escalation: Escalation) -> str:
    return f"Escalated: {escalation.label} → {escalation.next_step} ({escalation.why})"


def restarted(fault: str) -> tuple[str, str]:
    if fault in ("no_network", "frozen"):
        return (
            "Restart done. The device is back online.",
            "Restart: device back online → awaiting verification (a save counts only when payments resume)",
        )
    if fault == "speaker_fault":
        return (
            "I restarted it, but the speaker is still not responding. It needs a technician visit.",
            "Restart: speaker still silent → technician needed (a restart can't fix hardware)",
        )
    return (
        "Restart done. The device was already working.",
        "Restart: device was already healthy → no change (nothing to fix remotely)",
    )


def credit_applied(amount: int) -> tuple[str, str]:
    return (
        f"{format_inr(amount)} credit applied to this month's rent.",
        f"Goodwill credit: {format_inr(amount)} applied → rent marked paid (it was charged while the device was down)",
    )


def credit_refused(amount: int, cap: int) -> tuple[str, str]:
    return (
        "That is above my limit. I'll ask a senior to help.",
        f"Goodwill credit: {format_inr(amount)} refused → escalating (above the {format_inr(cap)} cap)",
    )


# System and human feed lines (no `result`: nobody is on the phone).

_OUTCOME_LABELS = {
    "fix_scheduled": "technician booked",
    "fixed_live": "fixed during the call",
    "statement_sent": "statement sent",
    "credit_applied": "credit applied",
    "handed_off": "handed to a human",
}


def call_ended(status: str, duration_s: float | None, outcome: str | None) -> str:
    if not duration_s:
        return f"Call ended: {status or 'no answer'} → no conversation (the merchant didn't pick up)"
    minutes, seconds = divmod(round(duration_s), 60)
    return f"Call ended after {minutes}:{seconds:02d} → {_OUTCOME_LABELS.get(outcome or '', 'no action taken')}"


_VISIT_FIXES = {"speaker_fault": "speaker replaced", "no_network": "network fixed", "frozen": "device reset"}


def technician_visited(name: str, fault: str) -> str:
    fix = _VISIT_FIXES.get(fault, "device checked")
    return f"Technician visited {name}: {fix} → awaiting payments (a save counts only when payments resume)"


def payments_resumed(name: str, txns: int) -> str:
    return f"Payments resumed at {name}: {txns} today, back to normal → verified save"


def human_takeover(name: str, escalation: Escalation, next_step: str | None) -> str:
    return f"Taken over: {name}, {escalation.label} → {next_step or escalation.next_step} (a person owns it now)"
