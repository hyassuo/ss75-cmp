#!/usr/bin/env bash
# Throwaway PostgreSQL 16 cluster for the E2E harness.
#   db.sh init    -> fresh cluster + schema + seed (destroys the previous one)
#   db.sh start | stop | psql [args]
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
SOCK="$PG_DIR/sock"

as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
psql_su() { psql -h "$SOCK" -p "$PG_PORT" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

start() {
  as_pg "'$PG_BIN/pg_ctl' -D '$PG_DIR/data' -o \"-p $PG_PORT -k '$SOCK' -c listen_addresses=127.0.0.1 -c max_connections=200\" -l '$PG_DIR/log' -w start" >/dev/null
}
stop() {
  [ -d "$PG_DIR/data" ] && as_pg "'$PG_BIN/pg_ctl' -D '$PG_DIR/data' -m fast stop" >/dev/null 2>&1 || true
}
load() { psql_su -d "$PG_DB" -f "$1" >/dev/null 2>"$STATE_DIR/load.err" || { echo "load failed: $1"; cat "$STATE_DIR/load.err"; exit 1; }; }

case "${1:-}" in
  init)
    mkdir -p "$STATE_DIR"
    stop
    rm -rf "$PG_DIR"
    mkdir -p "$PG_DIR/sock"
    chown -R postgres "$PG_DIR" 2>/dev/null || true
    as_pg "'$PG_BIN/initdb' -D '$PG_DIR/data' -A trust -U postgres" >/dev/null
    start
    psql_su -d postgres -c "CREATE DATABASE $PG_DB" >/dev/null
    load "$ROOT/tests/sql/supabase-stub.sql"
    load "$E2E_DIR/sql/00-harness-pre.sql"
    load "$ROOT/supabase-setup.sql"
    load "$ROOT/supabase-ifs-schema.sql"
    load "$ROOT/supabase-schema-v115.sql"
    load "$E2E_DIR/sql/90-seed.sql"
    psql_su -d "$PG_DB" -At -c "SELECT 'items=' || count(*) FROM items"
    ;;
  start) start ;;
  stop) stop ;;
  psql) shift; psql_su -d "$PG_DB" "$@" ;;
  *) echo "usage: $0 init|start|stop|psql"; exit 2 ;;
esac
