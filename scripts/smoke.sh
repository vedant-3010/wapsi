#!/usr/bin/env bash
# Smoke test a deployed backend (SETUP §10). PLAN Phase 3 extends it to every tool for M001.
# Usage: API=https://<backend>.vercel.app TOOL_SECRET=... WEBHOOK_SECRET=... ./scripts/smoke.sh
set -euo pipefail

: "${API:?set API to the backend URL}"
: "${TOOL_SECRET:?set TOOL_SECRET}"
: "${WEBHOOK_SECRET:?set WEBHOOK_SECRET}"

echo "== health"
curl -sS --fail-with-body "$API/api/health"; echo

echo "== diagnostics (M001)"
curl -sS --fail-with-body -X POST "$API/api/tools/diagnostics" \
  -H "Authorization: Bearer $TOOL_SECRET" -H "Content-Type: application/json" \
  -d '{"merchant_id":"M001"}'; echo

echo "== webhook (unknown execution id → {\"ok\":true,\"matched\":false})"
curl -sS --fail-with-body -X POST "$API/api/bolna/webhook?token=$WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-exec-1","status":"completed","conversation_duration":42,"transcript":"assistant: Namaste\nuser: Haan"}'; echo

echo "== reset"
curl -sS --fail-with-body -X POST "$API/api/demo/reset"; echo
