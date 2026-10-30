"""Bolna custom-function endpoints (SPEC §7). Stubs until PLAN 0.6 (diagnostics) and Phase 3 / 7."""

import logging
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException

from wapsi.models import (
    BookTechnicianRequest,
    EscalateRequest,
    GoodwillCreditRequest,
    ToolRequest,
    ToolResponse,
)

logger = logging.getLogger(__name__)

# What the agent says when we can't act. Tools always answer HTTP 200 (SPEC §7).
SAFE_RESULT = "I couldn't check that right now; a senior will call back."


class SafeToolRoute(APIRoute):
    """Safety net for SPEC §7: a malformed body (422) or an uncaught error (500) becomes HTTP 200."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def safe_handler(request: Request) -> Response:
            try:
                return await handler(request)
            except HTTPException:
                raise  # deliberate errors, e.g. the 401 from the TOOL_SECRET check
            except Exception:
                logger.exception("Tool %s failed; returning the safe result", request.url.path)
                return JSONResponse({"result": SAFE_RESULT})

        return safe_handler


router = APIRouter(prefix="/api/tools", route_class=SafeToolRoute)


@router.post("/diagnostics")
def diagnostics(body: ToolRequest) -> ToolResponse:
    return ToolResponse(result=SAFE_RESULT)


@router.post("/book-technician")
def book_technician(body: BookTechnicianRequest) -> ToolResponse:
    return ToolResponse(result=SAFE_RESULT)


@router.post("/resend-settlement")
def resend_settlement(body: ToolRequest) -> ToolResponse:
    return ToolResponse(result=SAFE_RESULT)


@router.post("/escalate")
def escalate(body: EscalateRequest) -> ToolResponse:
    return ToolResponse(result=SAFE_RESULT)


@router.post("/restart-device")
def restart_device(body: ToolRequest) -> ToolResponse:
    return ToolResponse(result=SAFE_RESULT)


@router.post("/goodwill-credit")
def goodwill_credit(body: GoodwillCreditRequest) -> ToolResponse:
    return ToolResponse(result=SAFE_RESULT)
