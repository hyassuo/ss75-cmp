# Shared configuration for the E2E harness (sourced by run.sh and db.sh).
# Every value can be overridden from the environment.
E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$E2E_DIR/../.." && pwd)"
export E2E_DIR ROOT

# PostgreSQL server binaries (initdb/pg_ctl): newest installed version.
export PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
# Where the throwaway cluster lives. As root the server runs as the
# "postgres" user, which must be able to read it (hence /var/lib/postgresql);
# as a normal user (CI) it goes under E2E_TMP.
if [ "$(id -u)" = 0 ]; then
  export PG_DIR="${PG_DIR:-/var/lib/postgresql/ss75-e2e}"
else
  export PG_DIR="${PG_DIR:-${E2E_TMP:-${TMPDIR:-/tmp}}/ss75-e2e-pg}"
fi
# Ports (change them to run next to another stack).
export PG_PORT="${PG_PORT:-55433}"
export PG_DB="${PG_DB:-ss75}"
export PGRST_PORT="${PGRST_PORT:-55434}"
export GW_PORT="${GW_PORT:-55435}"
export APP_PORT="${APP_PORT:-55436}"
# Test-only secrets (never used outside this local stack).
export JWT_SECRET="${JWT_SECRET:-ss75-e2e-local-jwt-secret-0123456789abcdef}"
export E2E_PASSWORD="${E2E_PASSWORD:-Passw0rd!e2e}"
export STATE_DIR="${STATE_DIR:-$E2E_DIR/.state}"          # logs, pid files, config
export STORAGE_DIR="${STORAGE_DIR:-$STATE_DIR/storage}"   # fake Storage file bytes
export ARTIFACTS="${ARTIFACTS:-$E2E_DIR/artifacts}"       # screenshots, results.json
# A pre-provisioned browser cache (e.g. a sandbox image) is used when present;
# otherwise Playwright's default cache (npx playwright install chromium).
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -d /opt/pw-browsers ]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
fi
export SUPABASE_URL_LOCAL="http://localhost:$GW_PORT"
export APP_URL="http://localhost:$APP_PORT"
ANON_KEY="$(node "$E2E_DIR/lib/jwt.mjs" anon)"
SERVICE_KEY="$(node "$E2E_DIR/lib/jwt.mjs" service_role)"
export ANON_KEY SERVICE_KEY
