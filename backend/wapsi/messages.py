"""What the agent says (`result`) and what the live feed shows (`detail`): SPEC §6–7.

Feed details follow `<Step>: <finding> → <decision> (<why>)` and are built only from these
templates, never from LLM text. `result` stays plain words for the merchant.
"""

from dataclasses import dataclass

from wapsi.util import format_inr

SAFE_RESULT = "I couldn't check that right now; a senior will call back."

LANGUAGE_NAMES = {"hi": "Hindi", "mr": "Marathi", "en": "English"}

# The agent's first line (Bolna welcome message = {greeting}). It says up front that it's an AI.
# Native script reads best with Sarvam Bulbul; brand words stay in English, as merchants say them.
_GREETINGS = {
    "hi": "नमस्ते {name} जी! मैं Wapsi, Paytm merchant support का AI assistant बोल रहा हूँ। "
          "आपके Soundbox में कुछ दिक्कत दिख रही है। क्या हुआ?",
    "mr": "नमस्कार {name} जी! मी Wapsi, Paytm merchant support चा AI assistant बोलतोय. "
          "तुमच्या Soundbox मध्ये काहीतरी अडचण दिसतेय. काय झालं?",
    "en": "Hello {name}! This is Wapsi, the AI assistant from Paytm merchant support. "
          "Your Soundbox seems to have a problem. What happened?",
}


def greeting(language: str, first_name: str) -> str:
    return _GREETINGS.get(language, _GREETINGS["hi"]).format(name=first_name)


def slot_labels(slots: list[str]) -> list[str]:
    """TECHNICIAN_SLOTS as the agent offers them: "tomorrow 11 AM to 1 PM"."""
    return [f"tomorrow {slot}" for slot in slots]


def slot_options(slots: list[str]) -> str:
    """All of them in one phrase: "tomorrow 11 AM to 1 PM or tomorrow 3 PM to 5 PM"."""
    return " or ".join(slot_labels(slots))


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
    why: str  # may contain {cap}
    result: str  # what the agent promises; matches next_step


_CALLBACK_TODAY = "A senior colleague will call you back today."
ESCALATIONS = {
    "hardship": Escalation("hardship", "Call back within 2 hours; offer rent pause",
                           "a rent pause needs a human decision",
                           "A senior colleague will call you back within 2 hours."),
    "angry": Escalation("angry", "Senior callback today", "still upset after one attempt to calm them", _CALLBACK_TODAY),
    "asked_for_person": Escalation("asked for a person", "Senior callback today", "the merchant asked for a person",
                                   _CALLBACK_TODAY),
    "above_cap": Escalation("credit above cap", "Approve or reject credit", "the credit asked is above the {cap} cap",
                            "A senior colleague will review the credit and call you back today."),
    "fraud_kyc": Escalation("fraud/KYC", "Route to risk team", "fraud and KYC go to the risk team only",
                            "Our risk team will call you back."),
    "fixes_failed": Escalation("fixes failed", "Send technician with replacement device", "two fixes did not work",
                               "A senior colleague will call you back today to send a replacement device."),
}
# Unknown or missing reason from the LLM: still hand off, never fail.
FALLBACK_ESCALATION = Escalation("needs a human", "Senior callback today", "the agent could not resolve it",
                                 _CALLBACK_TODAY)


def escalated_detail(escalation: Escalation, cap: int) -> str:
    why = escalation.why.format(cap=format_inr(cap))
    return f"Escalated: {escalation.label} → {escalation.next_step} ({why})"


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


# What the agent does next (`next` in a tool reply): an instruction for the LLM, never read aloud.
# It carries the same decision as the feed line, so the call goes the way the feed says it will.

def next_after_diagnostics(fault: str, rent_status: str, status: str, slot_options: str, cap: int) -> str:
    if fault == "speaker_fault":
        return offer_slots(slot_options)
    if fault in ("no_network", "frozen"):
        return "Call restart_device now, then run_diagnostics again."
    if status == "awaiting_verification":
        return "The device works now. Tell them, then ask if anything else is wrong."
    if rent_status == "failed":
        return (f"Ask about the rent. If they are upset they paid while the device was down,"
                f" call apply_goodwill_credit with {format_inr(cap)} or less.")
    return "Ask what is wrong. If they doubt a settlement, call resend_settlement."


def offer_slots(slot_options: str) -> str:
    return f"Offer only these slots: {slot_options}. Then call book_technician with the one they pick."


AFTER_BOOKING = "Tell them the visit time, then ask if anything else is wrong."
AFTER_RESTART = "Call run_diagnostics again to confirm the fix."
AFTER_ESCALATION = "Say the result as it is, thank them and close the call."
AFTER_CREDIT_REFUSED = "Call escalate_to_human with reason above_cap."


# Guardrails (SPEC §11): the backend held back what the LLM asked for, and says what to do instead.
# Feed rows are type `guardrail`, actor `system`; never quote LLM text in them (it goes in the payload).

def slot_not_offered(slot_options: str) -> tuple[str, str]:
    return (
        f"That time isn't available. I can book {slot_options}. Which one suits you?",
        "Guardrail: slot not on offer → asked the merchant to pick again (only offered slots can be booked)",
    )


def already_booked(slot: str, booking_id: str) -> tuple[str, str]:
    return (
        f"A technician is already booked for {slot}. Booking {booking_id}.",
        f"Guardrail: technician already booked ({booking_id}) → kept that booking (one visit per fault)",
    )


_REMOTE_FIX = {
    "no_network": "no signal is usually fixed remotely",
    "frozen": "a frozen device is usually fixed remotely",
}


def restart_first(fault: str) -> tuple[str, str]:
    return (
        "This can usually be fixed without a visit. Let me restart your device remotely first.",
        "Guardrail: technician visit held → trying a remote restart first"
        f" ({_REMOTE_FIX.get(fault, 'a restart is quicker than a visit')})",
    )


RESTART_FIRST_NEXT = "Call restart_device now. Book a technician only if the restart doesn't fix it."


def credit_already_given(given: int) -> tuple[str, str]:
    return (
        f"A goodwill credit of {format_inr(given)} is already applied this month. That is the most I can give.",
        f"Guardrail: {format_inr(given)} credit already given this month → no second credit"
        " (one goodwill credit a month)",
    )


CREDIT_GIVEN_NEXT = ("Don't call apply_goodwill_credit again."
                     " If they want more, call escalate_to_human with reason above_cap.")


def already_handed_off(escalation: Escalation) -> str:
    return f"Guardrail: already handed off ({escalation.label}) → kept the open handoff (one handoff per issue)"


def other_merchant(name: str) -> str:
    return (f"Guardrail: tool named another merchant → acted for {name}, who is on the call"
            " (never act for a merchant who isn't on the line)")


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
