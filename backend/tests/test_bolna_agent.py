"""The Bolna agent definition (scripts/bolna_agent.py): mid-call language switching."""

import importlib.util
import json
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
    # Left out rather than sent as null when switching is off (bolna_agent.agent_body).
    assert body["agent_config"]["tasks"][0]["tools_config"].get("multilingual_config") is None
    assert body["agent_prompts"]["task_1"]["system_prompt"] == bolna_agent.PROMPT


# Bolna drops the agent one second into every real call if a tool is malformed (found 2026-10-31).


def test_every_tool_template_is_valid_json_once_filled() -> None:
    values = {"merchant_id": "M001", "slot": "tomorrow 3 PM to 5 PM", "reason": "angry", "summary": "x", "amount": "100"}
    for lang in ("hi", "mr"):
        tools = bolna_agent.api_tools("https://backend.test", lang, "secret")
        assert set(tools["tools_params"]) == {t["name"] for t in tools["tools"]}
        for name, params in tools["tools_params"].items():
            json.loads(params["param"] % values)  # raises on an unquoted placeholder


def test_tools_send_only_fields_in_bolnas_tool_schema() -> None:
    for tool in bolna_agent.api_tools("https://backend.test", "hi", "secret")["tools"]:
        assert set(tool) == {"name", "key", "description", "parameters"}, tool["name"]
        assert tool["key"] == "custom_task"
