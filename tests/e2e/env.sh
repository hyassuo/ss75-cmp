# Shared configuration for the E2E harness (sourced by run.sh and friends).
# Every value can be overridden from the environment.
E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$E2E_DIR/../.." && pwd)"
export E2E_DIR ROOT
export PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
export PG_DIR="${PG_DIR:-/var/lib/postgresql/ss75-e2e}"   # postgres user must own it
export PG_PORT="${PG_PORT:-55433}"
export PG_DB="${PG_DB:-ss75}"
export PGRST_PORT="${PGRST_PORT:-55434}"
export GW_PORT="${GW_PORT:-55435}"
export APP_PORT="${APP_PORT:-55436}"
export JWT_SECRET="${JWT_SECRET:-ss75-e2e-local-jwt-secret-0123456789abcdef}"
export E2E_PASSWORD="${E2E_PASSWORD:-Passw0rd!e2e}"
export STORAGE_DIR="${STORAGE_DIR:-$E2E_DIR/.state/storage}"
export STATE_DIR="${STATE_DIR:-$E2E_DIR/.state}"
export ARTIFACTS="${ARTIFACTS:-$E2E_DIR/artifacts}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
export SUPABASE_URL_LOCAL="http://localhost:$GW_PORT"
export APP_URL="http://localhost:$APP_PORT"
ANON_KEY="$(node "$E2E_DIR/lib/jwt.mjs" anon)"
SERVICE_KEY="$(node "$E2E_DIR/lib/jwt.mjs" service_role)"
export ANON_KEY SERVICE_KEY
