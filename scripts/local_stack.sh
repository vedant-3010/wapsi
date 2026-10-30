#!/usr/bin/env bash
# Local Postgres + PostgREST with both migrations, for the backend integration tests (no Supabase needed).
#   ./scripts/local_stack.sh start    then: cd backend && WAPSI_POSTGREST_URL=http://127.0.0.1:3001 pytest -q
#   ./scripts/local_stack.sh stop
#   ./scripts/local_stack.sh reset    (fresh database, e.g. after a migration changes)
# Needs Postgres binaries (Postgres.app by default; set PG_BIN otherwise) and Docker.
set -euo pipefail

PG_BIN="${PG_BIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"
DATA="${TMPDIR:-/tmp}/wapsi-pg"
PORT=54329
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql_() { "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

start() {
  local fresh=0
  if [ ! -d "$DATA" ]; then
    "$PG_BIN/initdb" -D "$DATA" -U postgres -A trust --no-locale -E UTF8 >/dev/null
    fresh=1
  fi
  # UTC like Supabase, so current_date matches the backend's today().
  "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1 -c timezone=UTC" \
    -l "$DATA/log" -w start >/dev/null
  if [ "$fresh" = 1 ]; then
    # Stand-ins for what every Supabase project already has.
    psql_ -c "create role anon nologin; create role authenticated nologin;
              create role service_role nologin bypassrls; create publication supabase_realtime;"
    for migration in "$ROOT"/supabase/migrations/*.sql; do psql_ -f "$migration"; done
    psql_ -c "grant usage on schema public to service_role; grant all on all tables in schema public to service_role;"
    psql_ -c "select public.seed_demo();" >/dev/null
  fi
  docker rm -f wapsi-postgrest >/dev/null 2>&1 || true
  docker run -d --name wapsi-postgrest -p 127.0.0.1:3001:3000 \
    -e PGRST_DB_URI="postgres://postgres@host.docker.internal:$PORT/postgres" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=service_role \
    postgrest/postgrest:v12.2.3 >/dev/null
  for _ in $(seq 1 30); do curl -sf http://127.0.0.1:3001/merchants?limit=1 >/dev/null && break; sleep 0.5; done
  echo "PostgREST ready on http://127.0.0.1:3001"
}

stop() {
  docker rm -f wapsi-postgrest >/dev/null 2>&1 || true
  [ -d "$DATA" ] && "$PG_BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  reset) stop; rm -rf "$DATA"; start ;;
  *) echo "usage: $0 start|stop|reset" >&2; exit 1 ;;
esac
