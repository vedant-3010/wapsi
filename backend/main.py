"""Wapsi backend (Vercel project 1)."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from wapsi.config import get_settings
from wapsi.db import DbNotConfigured
from wapsi.routers import calls, demo, handoffs, health, runs, simulate, soundbox, tools, webhooks

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Wapsi")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (health, calls, runs, tools, webhooks, simulate, demo, handoffs, soundbox):
    app.include_router(module.router)


@app.exception_handler(DbNotConfigured)
def db_not_configured(request: Request, exc: DbNotConfigured) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Supabase is not configured on the backend"})
