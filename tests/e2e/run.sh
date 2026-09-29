#!/usr/bin/env bash
# End-to-end tests: the real app (next build + next start) in Chromium
# against a local stand-in for Supabase:
#
#   PostgreSQL (tests/sql/supabase-stub.sql + supabase/migrations/*.sql,
#   real RLS) -> PostgREST v12 -> tests/e2e/gateway.mjs (REST proxy, minimal
#   GoTrue, Storage that enforces the storage.objects RLS as the caller,
#   fault injection) -> next start -> Playwright (tests/e2e/scenarios.mjs).
#
# Usage: npm run test:e2e              (= bash tests/e2e/run.sh)
#        SKIP_BUILD=1 ...              reuse the .next build of a previous run
#        ONLY=c,d1 ...                 run a subset of scenarios
#        KEEP=1 ...                    leave the stack running afterwards
#        HEADED=1 ...                  show the browser
#        PERF=1 GW_LATENCY_MS=150 ...  load-performance measurements
#                                      (tests/e2e/perf.mjs) instead of the
#                                      scenarios; the latency is test-only
#        PG_PORT / PGRST_PORT / GW_PORT / APP_PORT, E2E_TMP, PG_BIN: see env.sh
#
# Needs: Node, PostgreSQL server binaries (initdb/pg_ctl/psql), curl, and a
# Chromium for Playwright (`cd tests/e2e && npx playwright install chromium`).
# Runs as root (server via `su postgres`) or as a normal user (CI).
# Note: it builds the app into ./.next with the local stack's
# NEXT_PUBLIC_* values — rebuild before deploying from the same checkout.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$E2E_DIR"
mkdir -p "$STATE_DIR" "$ARTIFACTS"
rm -rf "$STORAGE_DIR" && mkdir -p "$STORAGE_DIR"
: > "$STATE_DIR/gateway.log"

# --- dependencies (harness-local; the app's own dependencies are untouched)
[ -d "$ROOT/node_modules" ] || { echo "run 'npm ci' in $ROOT first"; exit 2; }
[ -d node_modules/playwright ] || npm ci --no-audit --no-fund >/dev/null
PGRST_VERSION=v12.2.3
PGRST_SHA256=9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c
if [ ! -x .bin/postgrest ]; then
  mkdir -p .bin
  curl -fsSL -o .bin/pgrst.tar.xz \
    "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x64.tar.xz"
  echo "$PGRST_SHA256  .bin/pgrst.tar.xz" | sha256sum -c --quiet - || { echo "PostgREST checksum mismatch"; exit 2; }
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
for p in "$PG_PORT" "$PGRST_PORT" "$GW_PORT" "$APP_PORT"; do
  free_port "$p" || { echo "port $p busy (stale run? set PG_PORT/PGRST_PORT/GW_PORT/APP_PORT)"; exit 2; }
done

# --- 1. database
echo "[1/5] postgres: fresh cluster at $PG_DIR (port $PG_PORT)"
"$E2E_DIR/db.sh" init

# --- 2. PostgREST
echo "[2/5] postgrest on :$PGRST_PORT"
# JWTs: the shared secret (HS256) and a per-run ES256 key, as a JWKS — the
# gateway signs with either (asymmetric signing keys, see gateway.mjs).
node lib/jwt.mjs jwks "$STATE_DIR/jwt-es256.pem" > "$STATE_DIR/jwks.json"
cat > "$STATE_DIR/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:$PG_PORT/$PG_DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "@$STATE_DIR/jwks.json"
db-max-rows = 1000
server-host = "127.0.0.1"
server-port = $PGRST_PORT
log-level = "error"
CONF
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
# Gemini is the gateway's stand-in (/gemini): a fixed analysis, no network.
export GEMINI_API_KEY="e2e-dummy-not-a-key"
export GEMINI_API_BASE="http://127.0.0.1:$GW_PORT/gemini"
STAMP="$ROOT/.next/.e2e-env"
WANT="$SUPABASE_URL_LOCAL|$ANON_KEY|$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo nogit)"
if [ "${SKIP_BUILD:-0}" != 1 ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$WANT" ]; then
  echo "[4/5] next build"
  (cd "$ROOT" && node node_modules/next/dist/bin/next build > "$STATE_DIR/build.log" 2>&1) || { tail -40 "$STATE_DIR/build.log"; exit 1; }
  echo "$WANT" > "$STAMP"
else
  echo "[4/5] next build skipped (SKIP_BUILD=1, same commit and keys)"
fi
(cd "$ROOT" && exec setsid node node_modules/next/dist/bin/next start -p "$APP_PORT" > "$STATE_DIR/next.log" 2>&1) & PIDS+=($!)
wait_http "$APP_URL/login"

# --- 5. scenarios
SCRIPT=scenarios.mjs
[ "${PERF:-0}" = 1 ] && SCRIPT=perf.mjs
echo "[5/5] playwright $SCRIPT"
set +e
node "$SCRIPT" 2>&1 | tee "$ARTIFACTS/run.log"
RC=${PIPESTATUS[0]}
set -e
cp "$STATE_DIR"/*.log "$ARTIFACTS/" 2>/dev/null || true
echo "artifacts: $ARTIFACTS"
exit "$RC"
