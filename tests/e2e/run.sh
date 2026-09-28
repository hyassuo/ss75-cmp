#!/usr/bin/env bash
# One-shot E2E run of the SS-75 CMP app against a local fake Supabase:
#   PostgreSQL 16 (real schema + RLS) -> PostgREST v12 -> Node gateway
#   (REST proxy + fake GoTrue + fake Storage with real RLS) -> next start
#   -> Playwright/Chromium scenarios (tests/e2e/scenarios.mjs).
#
# Usage: tests/e2e/run.sh              full run (fresh DB, build if needed)
#        SKIP_BUILD=1 tests/e2e/run.sh reuse .next from a previous build
#        ONLY=c,d1 tests/e2e/run.sh    run a subset of scenarios
#        KEEP=1 tests/e2e/run.sh       leave the stack running afterwards
# Needs: root or the postgres user, PG16 at $PG_BIN, Chromium under
# $PLAYWRIGHT_BROWSERS_PATH (revision 1194 -> playwright 1.56.1), network
# for the first npm install / PostgREST download / next/font at build time.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$E2E_DIR"
mkdir -p "$STATE_DIR" "$ARTIFACTS"
rm -rf "$STORAGE_DIR" && mkdir -p "$STORAGE_DIR"
: > "$STATE_DIR/gateway.log"

# --- dependencies (harness-local; the app's node_modules stay untouched)
[ -e "$ROOT/node_modules" ] || { echo "app node_modules missing at $ROOT/node_modules (symlink it)"; exit 2; }
[ -d node_modules/playwright ] || npm i --no-audit --no-fund >/dev/null
if [ ! -x .bin/postgrest ]; then
  mkdir -p .bin
  curl -sSL -o .bin/pgrst.tar.xz https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -C .bin -xf .bin/pgrst.tar.xz && rm .bin/pgrst.tar.xz
fi

PIDS=()
cleanup() {
  if [ "${KEEP:-0}" = 1 ]; then echo "KEEP=1: stack left running (pids ${PIDS[*]:-})"; return; fi
  # each service runs in its own process group (setsid) -> kill the group
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done
  [ -f "$STATE_DIR/pgrst.pid" ] && kill "$(cat "$STATE_DIR/pgrst.pid")" 2>/dev/null || true
  "$E2E_DIR/db.sh" stop || true
}
trap cleanup EXIT
free_port() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
wait_http() { for _ in $(seq 1 120); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done; echo "timeout waiting for $1"; return 1; }
for p in "$PGRST_PORT" "$GW_PORT" "$APP_PORT"; do free_port "$p" || { echo "port $p busy (stale run? pkill -f ss75-e2e)"; exit 2; }; done

# --- 1. database
echo "[1/5] postgres: fresh cluster at $PG_DIR (port $PG_PORT)"
"$E2E_DIR/db.sh" init

# --- 2. PostgREST
echo "[2/5] postgrest on :$PGRST_PORT"
cat > "$STATE_DIR/pgrst.conf" <<EOF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:$PG_PORT/$PG_DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
db-max-rows = 1000
server-host = "127.0.0.1"
server-port = $PGRST_PORT
log-level = "error"
EOF
setsid .bin/postgrest "$STATE_DIR/pgrst.conf" > "$STATE_DIR/pgrst.log" 2>&1 & PIDS+=($!)
echo $! > "$STATE_DIR/pgrst.pid"  # scenario c stops/restarts it
wait_http "http://127.0.0.1:$PGRST_PORT/"

# --- 3. gateway
echo "[3/5] gateway on :$GW_PORT"
setsid node gateway.mjs > "$STATE_DIR/gateway.out" 2>&1 & PIDS+=($!)
wait_http "http://127.0.0.1:$GW_PORT/__ctl/health"

# --- 4. app (NEXT_PUBLIC_* are inlined at build time -> rebuild when they change)
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL_LOCAL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" NEXT_PUBLIC_APP_URL="$APP_URL" NEXT_TELEMETRY_DISABLED=1
STAMP="$ROOT/.next/.e2e-env"
WANT="$SUPABASE_URL_LOCAL|$ANON_KEY"
if [ "${SKIP_BUILD:-0}" != 1 ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$WANT" ]; then
  echo "[4/5] next build"
  (cd "$ROOT" && npx next build > "$STATE_DIR/build.log" 2>&1) || { tail -40 "$STATE_DIR/build.log"; exit 1; }
  echo "$WANT" > "$STAMP"
else
  echo "[4/5] next build skipped (SKIP_BUILD=1)"
fi
(cd "$ROOT" && exec setsid node node_modules/next/dist/bin/next start -p "$APP_PORT" > "$STATE_DIR/next.log" 2>&1) & PIDS+=($!)
wait_http "$APP_URL/login"

# --- 5. scenarios
echo "[5/5] playwright scenarios"
set +e
node scenarios.mjs 2>&1 | tee "$ARTIFACTS/run.log"
RC=${PIPESTATUS[0]}
set -e
echo "artifacts: $ARTIFACTS"
exit "$RC"
