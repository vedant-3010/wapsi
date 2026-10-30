"""Wapsi backend (Vercel project 1)."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from wapsi.config import get_settings
from wapsi.routers import calls, demo, handoffs, health, runs, simulate, tools, webhooks

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Wapsi")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (health, calls, runs, tools, webhooks, simulate, demo, handoffs):
    app.include_router(module.router)
