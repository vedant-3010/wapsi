#!/usr/bin/env bash
# Smoke test a deployed backend (SETUP §10): health, every tool for M001, the webhook, then a reset.
# Usage: API=https://<backend>.vercel.app TOOL_SECRET=... WEBHOOK_SECRET=... ./scripts/smoke.sh
# Never starts a call. It changes M001's data, so it always ends with POST /api/demo/reset.
set -euo pipefail

: "${API:?set API to the backend URL}"
: "${TOOL_SECRET:?set TOOL_SECRET}"
: "${WEBHOOK_SECRET:?set WEBHOOK_SECRET}"

post_tool() {
  echo "== $1"
  curl -sS --fail-with-body -X POST "$API/api/tools/$1" \
    -H "Authorization: Bearer $TOOL_SECRET" -H "Content-Type: application/json" -d "$2"
  echo
}

echo "== health"
curl -sS --fail-with-body "$API/api/health"; echo

post_tool diagnostics '{"merchant_id":"M001"}'
post_tool book-technician '{"merchant_id":"M001","slot":"tomorrow 11 AM to 1 PM"}'
post_tool resend-settlement '{"merchant_id":"M001"}'
post_tool escalate '{"merchant_id":"M001","reason":"asked_for_person","summary":"Smoke test"}'
post_tool restart-device '{"merchant_id":"M001"}'
post_tool goodwill-credit '{"merchant_id":"M001","amount":100}'

echo "== webhook (unknown execution id → {\"ok\":true,\"matched\":false})"
curl -sS --fail-with-body -X POST "$API/api/bolna/webhook?token=$WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-exec-1","status":"completed","conversation_duration":42,"transcript":"assistant: Namaste\nuser: Haan"}'; echo

echo "== reset"
curl -sS --fail-with-body -X POST "$API/api/demo/reset"; echo
