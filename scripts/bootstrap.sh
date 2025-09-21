#!/usr/bin/env bash
set -euo pipefail

# ---------------- Config (override via envs) ----------------
PORT="${PORT:-3002}"
USER_ID="${USER_ID:-demo-user-001}"
DELTA="${DELTA:-100}"
NOTE="${NOTE:-seed balance}"
ENV_FILE="${ENV_FILE:-projects-app/.env.local}"
SERVER_FILE="projects-app/scripts/api-server.mjs"
PIDFILE="projects-app/.server-${PORT}.pid"
LOGFILE="projects-app/.server-${PORT}.log"
SQL_FILE="${SQL_FILE:-sql/wallet_schema.sql}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-}"  # optional for auto-SQL

step() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

# 0) Node version
step "Checking Node version (>=18 required)"
node -v
NODE_MAJ="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJ" -lt 18 ]; then
  echo "Node >=18 required. Found $(node -v)."; exit 1
fi

# 1) Load env
step "Loading env from ${ENV_FILE}"
[ -f "$ENV_FILE" ] || { echo "Missing ${ENV_FILE}"; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${SUPABASE_URL:?SUPABASE_URL missing in ${ENV_FILE}}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY missing in ${ENV_FILE}}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN missing in ${ENV_FILE}}"

# 2) Optional SQL apply (skips if psql/URL not available)
if [ -n "$SUPABASE_DB_URL" ] && command -v psql >/dev/null 2>&1; then
  if [ -f "$SQL_FILE" ]; then
    step "Applying SQL schema via psql → ${SQL_FILE}"
    set +e
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
    SQL_RC=$?
    set -e
    if [ $SQL_RC -ne 0 ]; then
      echo "⚠️  SQL apply failed (likely network policy). Continuing without it."
    fi
  else
    step "SQL file ${SQL_FILE} not found. Skipping SQL apply."
  fi
else
  step "Skipping SQL apply (psql or SUPABASE_DB_URL not set)."
fi

# 3) Stop any existing server on port
step "Stopping any existing server on port ${PORT}"
[ -f "$PIDFILE" ] && { kill -9 "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; }
if command -v lsof >/dev/null 2>&1; then
  PID_BY_PORT="$(lsof -ti tcp:"$PORT" || true)"
  [ -n "$PID_BY_PORT" ] && kill -9 "$PID_BY_PORT" 2>/dev/null || true
fi

# 4) Start server (background)
step "Starting server → PORT=${PORT} node ${SERVER_FILE}"
rm -f "$LOGFILE"
nohup env PORT="${PORT}" node "${SERVER_FILE}" > "${LOGFILE}" 2>&1 < /dev/null &
SERVER_PID=$!
echo "$SERVER_PID" > "$PIDFILE"
echo "PID: ${SERVER_PID}  LOG: ${LOGFILE}  PIDFILE: ${PIDFILE}"

# 5) Wait for /api/hello
step "Waiting for /api/hello on port ${PORT}"
HELLO_URL="http://localhost:${PORT}/api/hello"
for i in {1..30}; do
  if curl -sS "$HELLO_URL" | grep -q '"ok":true'; then
    echo "Health OK"; break
  fi
  sleep 0.5
  [ "$i" -eq 30 ] && { echo "Server not healthy in time. Check ${LOGFILE}."; exit 1; }
done

# 6) Wallet GET (before)
step "GET wallet (before) for user_id=${USER_ID}"
curl -sS "http://localhost:${PORT}/api/data-balance?userId=${USER_ID}" | tee /tmp/wallet_before.json

# 7) Wallet POST (seed)
step "POST wallet seed: delta=${DELTA}"
curl -sS -X POST "http://localhost:${PORT}/api/data-balance" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${ADMIN_TOKEN}" \
  -d "{\"userId\":\"${USER_ID}\",\"delta\":${DELTA},\"note\":\"${NOTE}\"}" \
  | tee /tmp/wallet_post.json

# 8) Wallet GET (after)
step "GET wallet (after)"
curl -sS "http://localhost:${PORT}/api/data-balance?userId=${USER_ID}" | tee /tmp/wallet_after.json

# 9) Done
step "All done ✅"
echo "• Stop: kill \$(cat ${PIDFILE})"
echo "• Logs: tail -f ${LOGFILE}"
echo "• Change port: PORT=3001 ./scripts/bootstrap.sh"
