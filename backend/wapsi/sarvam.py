"""Sarvam Bulbul text to speech: the virtual Soundbox's payment announcement (F9)."""

import base64
import logging
from functools import lru_cache

from sarvamai import SarvamAI

from wapsi.config import Settings

logger = logging.getLogger(__name__)

# What a Soundbox says when a payment lands: the same words as dashboard/src/lib/announce.ts, which
# the 3D model's speech bubble shows. Amounts stay digits; Bulbul reads them in the language.
ANNOUNCEMENTS: dict[str, tuple[str, str]] = {
    "hi": ("hi-IN", "Paytm पर {amount} रुपये प्राप्त हुए"),
    "mr": ("mr-IN", "Paytm वर {amount} रुपये मिळाले"),
    "en": ("en-IN", "Received {amount} rupees on Paytm"),
}


class SarvamError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _client(api_key: str) -> SarvamAI:
    return SarvamAI(api_subscription_key=api_key, timeout=8)


@lru_cache(maxsize=256)
def _speak(api_key: str, model: str, speaker: str, language_code: str, text: str) -> bytes:
    """WAV bytes, cached per warm instance: the same amount always sounds the same."""
    response = _client(api_key).text_to_speech.convert(
        text=text, language_code=language_code, model=model, speaker=speaker, output_audio_codec="wav",
    )
    logger.info("Sarvam voiced %r (%s): request %s", text, language_code, response.request_id)
    return base64.b64decode("".join(response.audios))


def announcement(settings: Settings, amount: int, language: str) -> bytes:
    language_code, template = ANNOUNCEMENTS.get(language, ANNOUNCEMENTS["hi"])
    try:
        return _speak(settings.sarvam_api_key, settings.sarvam_tts_model, settings.sarvam_speaker,
                      language_code, template.format(amount=amount))
    except Exception as exc:  # the SDK raises its own ApiError as well as httpx errors
        raise SarvamError(str(exc)[:200]) from exc
