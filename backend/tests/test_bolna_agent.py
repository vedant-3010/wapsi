"""The Bolna agent definition (scripts/bolna_agent.py): mid-call language switching."""

import importlib.util
from pathlib import Path
from typing import Any

import pytest

_spec = importlib.util.spec_from_file_location(
    "bolna_agent", Path(__file__).resolve().parents[1] / "scripts" / "bolna_agent.py")
assert _spec is not None and _spec.loader is not None
bolna_agent = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bolna_agent)

ENV = {"TOOL_SECRET": "tool", "WEBHOOK_SECRET": "hook"}


def tools_config(lang: str = "hi", switch: str = "auto") -> dict[str, Any]:
    body = bolna_agent.agent_body("https://backend.test", lang, ENV, switch)
    return body["agent_config"]["tasks"][0]["tools_config"]


@pytest.mark.parametrize("lang", ["hi", "mr"])
def test_agent_starts_in_its_language_and_can_switch_to_every_merchant_language(lang: str) -> None:
    config = tools_config(lang)["multilingual_config"]
    # Bolna refuses the agent without both: at least 2 languages, starting in one of them
    assert config["enabled"] is True
    assert config["active_language"] == lang
    assert set(config["languages"]) == {"hi", "mr", "en"}
    assert config["language_switch_trigger"] == "requested_or_auto_detected"


def test_each_language_has_its_own_ears_voice_and_prompt() -> None:
    languages = tools_config()["multilingual_config"]["languages"]
    for code, name in [("hi", "Hindi"), ("mr", "Marathi"), ("en", "English")]:
        entry = languages[code]
        assert entry["transcriber"] == {"language": code}
        assert entry["synthesizer"]["provider_config"]["language"] == code  # Sarvam needs it per voice
        assert entry["synthesizer"]["provider_config"]["voice_id"] == "shubh"  # one voice across a switch
        assert f"Speak {name}." in entry["system_prompt"]
        assert f"in {name}, keeping every amount" in entry["system_prompt"]
        assert "{language_name}" not in entry["system_prompt"]
        assert "switch" not in entry["system_prompt"]  # Bolna switches; the prompt must not fight it
        assert "{merchant_id}" in entry["system_prompt"]  # call variables stay for Bolna to fill
        assert entry["handoff_message"]


def test_asked_switches_only_on_request() -> None:
    assert tools_config(switch="asked")["multilingual_config"]["language_switch_trigger"] == "caller_requested"


def test_off_pins_the_agent_to_one_language() -> None:
    body = bolna_agent.agent_body("https://backend.test", "mr", ENV, "off")
    assert body["agent_config"]["tasks"][0]["tools_config"]["multilingual_config"] is None
    assert body["agent_prompts"]["task_1"]["system_prompt"] == bolna_agent.PROMPT
