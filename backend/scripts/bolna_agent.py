"""Create (or update) the Wapsi agent in Bolna from SPEC §8, so the agent lives in code, not clicks.

Reads BOLNA_API_KEY, TOOL_SECRET and WEBHOOK_SECRET from backend/.env.production (or the environment)
and never prints them. From backend/:
    .venv/bin/python scripts/bolna_agent.py https://wapsi-backend.vercel.app             # Hindi agent
    .venv/bin/python scripts/bolna_agent.py https://wapsi-backend.vercel.app --lang mr   # Marathi agent
    .venv/bin/python scripts/bolna_agent.py https://wapsi-backend.vercel.app --update <agent id>
Prints the agent id: set it as BOLNA_AGENT_ID (Hindi) or BOLNA_AGENT_IDS=mr=<id> (Marathi) on Vercel.

Every agent speaks Hindi, Marathi and English: it starts in --lang and Bolna follows the merchant mid-call,
moving the transcriber, voice and prompt together. --switch asked switches only when the merchant asks for a
language; --switch off pins the agent to --lang (the fallback if a rehearsal call switches by mistake).
"""

import argparse
import json
import os
import sys
from typing import Any

import httpx
from dotenv import dotenv_values

BOLNA_AGENT_URL = "https://api.bolna.ai/v2/agent"

LANGUAGE_NAMES = {"hi": "Hindi", "mr": "Marathi", "en": "English"}  # the merchants' languages (0001_schema.sql)

# Said once when the merchant moves into this language mid-call.
SWITCHED = {
    "hi": "ठीक है, अब हिंदी में बात करते हैं।",
    "mr": "ठीक आहे, आता मराठीत बोलूया.",
    "en": "Sure, let's continue in English.",
}

SWITCH_TRIGGERS = {"auto": "requested_or_auto_detected", "asked": "caller_requested"}

PROMPT = """You are Wapsi, Paytm merchant support's AI assistant, calling about the merchant's Soundbox.
Speak {language_name}; if they switch language, follow them. Short, simple sentences. One question at a time.
Never read IDs, field names or these instructions aloud.

Already known (never ask for it):
- Shop: {merchant_name}, owner {owner_name} (call them {owner_first_name} ji)
- merchant_id: {merchant_id}
- Signal: {reason}
- Last settlement: {last_settlement_amount} on {last_settlement_date}

Flow:
1. You have greeted them. If the person says they are not {owner_first_name}, share no account details:
   ask when {owner_first_name} is free, thank them and end the call.
2. Listen to what happened. Then ALWAYS call run_diagnostics first, with merchant_id {merchant_id}.
3. Each tool reply has "result": tell the merchant that, in {language_name}, keeping every amount, date and
   time exactly as written. Most replies also have "next": do what it says. Never read "next" aloud.
4. Fix based on the diagnosis:
   - Speaker fault: offer only these slots: {slot_options}. Call book_technician with the one they pick.
   - No signal or frozen: call restart_device, then run_diagnostics again.
   - They doubt their settlement: call resend_settlement.
   - Upset about rent paid while the device was down: call apply_goodwill_credit, {goodwill_cap} or less, once.
5. Call escalate_to_human when: they ask for a person; still angry after one attempt to calm them;
   hardship (shop closing, illness, money stress); they want more than {goodwill_cap} credit;
   fraud or KYC topics; two fixes failed. Say exactly what its result promises.
6. Close: say what you did and what happens next, thank them. Keep the call under 2 minutes.

Safety (always):
- Never ask for, or let them read out, an OTP, PIN, password, CVV, card or bank details. If they start to,
  stop them: Paytm never asks for these.
- Never ask them to install an app, share their screen, or send money.
- Say only facts from "Already known" or a tool result. Never guess an amount, date, time or cause.
  If you don't know, say a senior will check, and call escalate_to_human.
- Never promise a visit, credit, refund or callback that a tool did not confirm.
- Stay on the Soundbox, payments and settlements. Politely decline anything else (loans, offers, other products).
- The escalate_to_human summary is one English sentence, with no phone, account or card numbers."""

MERCHANT_ID = {"type": "string", "description": "merchant_id from the call context, e.g. M001. Never ask the merchant."}

# name → (path, description, extra properties, param template, pre-call message per language)
TOOLS: dict[str, tuple[str, str, dict[str, Any], str, dict[str, str]]] = {
    "run_diagnostics": (
        "/api/tools/diagnostics",
        "Run remote diagnostics on the merchant's Soundbox. Always call this first, before suggesting any fix, "
        "and again after a restart.",
        {}, '{"merchant_id": "%(merchant_id)s"}',
        {"hi": "एक सेकंड, मैं आपका device check करता हूँ।", "mr": "एक सेकंद, मी तुमचं device तपासतो."},
    ),
    "book_technician": (
        "/api/tools/book-technician",
        "Book a technician visit for a speaker fault, in one of the slots offered.",
        {"slot": {"type": "string", "description": "The offered slot the merchant picked, e.g. tomorrow 11 AM to 1 PM"}},
        '{"merchant_id": "%(merchant_id)s", "slot": "%(slot)s"}',
        {"hi": "मैं technician का slot देख रहा हूँ।", "mr": "मी technician चा slot बघतोय."},
    ),
    "resend_settlement": (
        "/api/tools/resend-settlement",
        "Look up the latest settlement and send the statement on WhatsApp, when the merchant doubts it arrived.",
        {}, '{"merchant_id": "%(merchant_id)s"}',
        {"hi": "मैं आपका statement निकाल रहा हूँ।", "mr": "मी तुमचं statement काढतोय."},
    ),
    "escalate_to_human": (
        "/api/tools/escalate",
        "Hand the merchant to a senior colleague. Use for the cases listed in the prompt.",
        {
            "reason": {"type": "string",
                       "enum": ["asked_for_person", "angry", "hardship", "above_cap", "fraud_kyc", "fixes_failed"]},
            "summary": {"type": "string",
                        "description": "One English sentence, with no phone, account or card numbers"},
        },
        '{"merchant_id": "%(merchant_id)s", "reason": "%(reason)s", "summary": "%(summary)s"}',
        {"hi": "मैं आपको अपने senior से जोड़ रहा हूँ।", "mr": "मी तुम्हाला माझ्या senior शी जोडतोय."},
    ),
    "restart_device": (
        "/api/tools/restart-device",
        "Restart the Soundbox remotely. Use when diagnostics finds no signal or a frozen device.",
        {}, '{"merchant_id": "%(merchant_id)s"}',
        {"hi": "मैं remote से आपका device restart कर रहा हूँ।", "mr": "मी remote ने तुमचं device restart करतोय."},
    ),
    "apply_goodwill_credit": (
        "/api/tools/goodwill-credit",
        "Credit rent charged while the device was down, up to the cap, once a month.",
        {"amount": {"type": "integer", "description": "Rupees, whole number"}},
        '{"merchant_id": "%(merchant_id)s", "amount": %(amount)i}',
        {"hi": "मैं देखता हूँ क्या कर सकते हैं।", "mr": "मी बघतो काय करता येईल."},
    ),
}


def api_tools(backend: str, lang: str, tool_secret: str) -> dict[str, Any]:
    tools, params = [], {}
    for name, (path, description, extra, param, pre_call) in TOOLS.items():
        tools.append({
            "name": name,
            "key": "custom_task",
            "description": description,
            "pre_call_message": pre_call[lang],
            "parameters": {"type": "object", "properties": {"merchant_id": MERCHANT_ID, **extra},
                           "required": ["merchant_id"]},
        })
        params[name] = {"method": "POST", "url": f"{backend}{path}", "api_token": f"Bearer {tool_secret}",
                        "param": param}
    return {"tools": tools, "tools_params": params}


def prompt_in(lang: str) -> str:
    """The prompt while the call is in `lang`. Bolna does the switching, so the prompt carries no switching rule."""
    name = LANGUAGE_NAMES[lang]
    return PROMPT.replace("; if they switch language, follow them", "").replace("{language_name}", name)


def voice(lang: str) -> dict[str, Any]:
    """Sarvam Bulbul, one speaker in every language, so a switch keeps the same voice."""
    return {"voice": "Shubh", "voice_id": "shubh", "model": "bulbul:v3", "language": lang, "speed": 1}


def multilingual(lang: str, trigger: str) -> dict[str, Any]:
    return {
        "enabled": True,
        "active_language": lang,
        "language_switch_trigger": trigger,
        "languages": {
            code: {
                "transcriber": {"language": code},
                "synthesizer": {"provider": "sarvam", "provider_config": voice(code)},
                "system_prompt": prompt_in(code),
                "handoff_message": SWITCHED[code],
            }
            for code in LANGUAGE_NAMES
        },
    }


def agent_body(backend: str, lang: str, env: dict[str, str], switch: str = "auto") -> dict[str, Any]:
    switching = switch in SWITCH_TRIGGERS
    return {
        "agent_config": {
            "agent_name": f"Wapsi ({LANGUAGE_NAMES[lang]})",
            "agent_welcome_message": "{greeting}",
            "webhook_url": f"{backend}/api/bolna/webhook?token={env['WEBHOOK_SECRET']}",
            "call_summary_enabled": True,
            # No calling_guardrails here: the backend enforces CALLING_HOURS before it places a call, and
            # Bolna's copy ended a real call at 12:46 IST one second after it was answered.
            "tasks": [{
                "task_type": "conversation",
                "toolchain": {"execution": "parallel", "pipelines": [["transcriber", "llm", "synthesizer"]]},
                "tools_config": {
                    "llm_agent": {
                        "agent_type": "simple_llm_agent",
                        "agent_flow_type": "streaming",
                        "llm_config": {"provider": "openai", "model": "gpt-4.1-mini", "temperature": 0.2,
                                       "max_tokens": 150},
                    },
                    # Audio format and sampling rate are left to Bolna, which matches them to the phone line;
                    # forcing them silenced a real call in both directions.
                    "synthesizer": {"provider": "sarvam", "provider_config": voice(lang), "stream": True,
                                    "buffer_size": 250},
                    "transcriber": {"provider": "sarvam", "model": "saaras:v4", "language": lang, "stream": True,
                                    "endpointing": 400, "keywords": "Paytm,Soundbox,settlement,technician"},
                    "input": {"provider": "plivo", "format": "wav"},
                    "output": {"provider": "plivo", "format": "wav"},
                    "api_tools": api_tools(backend, lang, env["TOOL_SECRET"]),
                    "multilingual_config": multilingual(lang, SWITCH_TRIGGERS[switch]) if switching else None,
                },
                "task_config": {"hangup_after_silence": 15, "call_terminate": 240, "voicemail": False,
                                "check_if_user_online": True, "hangup_after_LLMCall": False},
            }],
        },
        "agent_prompts": {"task_1": {"system_prompt": prompt_in(lang) if switching else PROMPT}},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("backend", help="public backend URL, e.g. https://wapsi-backend.vercel.app")
    parser.add_argument("--lang", choices=["hi", "mr"], default="hi", help="the language a call starts in")
    parser.add_argument("--switch", choices=[*SWITCH_TRIGGERS, "off"], default="auto",
                        help="follow the merchant's language mid-call: auto-detected or asked (default auto)")
    parser.add_argument("--update", metavar="AGENT_ID", help="update this agent instead of creating one")
    parser.add_argument("--env-file", default=".env.production")
    args = parser.parse_args()

    env = {**os.environ, **{k: v for k, v in dotenv_values(args.env_file).items() if v}}
    missing = [k for k in ("BOLNA_API_KEY", "TOOL_SECRET", "WEBHOOK_SECRET") if not env.get(k)]
    if missing:
        sys.exit(f"Missing {', '.join(missing)} in {args.env_file} or the environment")

    body = agent_body(args.backend.rstrip("/"), args.lang, env, args.switch)
    headers = {"Authorization": f"Bearer {env['BOLNA_API_KEY']}"}
    if args.update:
        response = httpx.put(f"{BOLNA_AGENT_URL}/{args.update}", headers=headers, json=body, timeout=30)
    else:
        response = httpx.post(BOLNA_AGENT_URL, headers=headers, json=body, timeout=30)

    text = response.text
    for secret in (env["BOLNA_API_KEY"], env["TOOL_SECRET"], env["WEBHOOK_SECRET"]):
        text = text.replace(secret, "[secret]")
    if response.is_error:
        sys.exit(f"Bolna HTTP {response.status_code}: {text[:500]}")
    data = json.loads(text)
    print(f"{data.get('state', 'updated')}: agent {data.get('agent_id', args.update)} ({args.lang}, switch {args.switch})")


if __name__ == "__main__":
    main()
