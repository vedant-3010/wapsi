"""Generate dashboard/public/sounds/received.wav with Sarvam Bulbul (SETUP §9). Run once from the repo root."""

import base64, os, requests

r = requests.post(
    "https://api.sarvam.ai/text-to-speech",
    headers={"api-subscription-key": os.environ["SARVAM_API_KEY"], "Content-Type": "application/json"},
    json={
        "text": "Pachaas rupaye prapt hue.",
        "language_code": "hi-IN",
        "speaker": "shubh",
        "model": "bulbul:v3",
        "output_audio_codec": "wav",
        "speech_sample_rate": 22050,
    },
    timeout=30,
)
r.raise_for_status()
os.makedirs("dashboard/public/sounds", exist_ok=True)
with open("dashboard/public/sounds/received.wav", "wb") as f:
    f.write(base64.b64decode(r.json()["audios"][0]))
