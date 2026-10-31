"""First Sarvam call: Bulbul text to speech in Hindi, saved as a WAV.

Reads SARVAM_API_KEY from the environment (never hard-code it). From backend/:
    set -a; . ./.env; set +a; .venv/bin/python scripts/sarvam_first_call.py
"""

import base64
import os

from sarvamai import SarvamAI

client = SarvamAI(api_subscription_key=os.environ["SARVAM_API_KEY"])
response = client.text_to_speech.convert(
    text="Paytm पर 180 रुपये प्राप्त हुए",
    language_code="hi-IN",
    model="bulbul:v3",
    speaker="priya",
    output_audio_codec="wav",
)
audio = base64.b64decode("".join(response.audios))
with open("sarvam_first_call.wav", "wb") as out:
    out.write(audio)
print(f"Sarvam request {response.request_id}: saved sarvam_first_call.wav ({len(audio):,} bytes)")
