#!/usr/bin/env bash
# MBO Universal MCP Loader — Vendor-Agnostic Session Initializer
set -uo pipefail

# Redirect all status to stderr to protect JSON-RPC stdout
exec 3>&1
exec 1>&2

echo "[MBO] Initializing Session Start Protocol..."
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$ROOT/data/mirrorbox.db"
AGENT="operator"

# Mode and agent selection
for arg in "$@"; do
    if [[ $arg == "--mode=dev" ]]; then
        DB_PATH="$ROOT/.dev/data/dev-graph.db"
    elif [[ $arg == --agent=* ]]; then
        AGENT="${arg#--agent=}"
    fi
done

# Write PID file — trap ensures cleanup on crash/unexpected exit
mkdir -p "$ROOT/.dev/run"
PID_FILE="$ROOT/.dev/run/${AGENT}.pid"
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"; echo "[MBO] PID file cleaned up on exit."' EXIT

# Database Integrity & Lock Recovery (non-fatal — warn and continue)
if [ -f "$DB_PATH" ]; then
    echo "[MBO] Verifying: $DB_PATH"
    node -e "
const Database = require('better-sqlite3');
try {
    const db = new Database('$DB_PATH', { timeout: 5000 });
    const check = db.prepare('PRAGMA integrity_check').get();
    if (check.integrity_check !== 'ok') {
        console.error('[WARN] DB Integrity Issue (continuing):', check);
    }
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
    db.close();
} catch (e) {
    console.error('[WARN] DB Check Error (continuing):', e.message);
}" || echo "[WARN] DB check node process failed — continuing anyway."
else
    echo "[WARN] Database not found at $DB_PATH — server will create on first use."
fi

echo "[MBO] Environment Verified. Launching Watchdog and MCP..."
bash "$ROOT/scripts/mbo-watchdog.sh" "$AGENT" &
WATCHDOG_PID=$!
echo $WATCHDOG_PID > "$ROOT/.dev/run/watchdog-${AGENT}.pid"

# Cleanup trap for both the shell and the watchdog
trap 'rm -f "$PID_FILE"; rm -f "$ROOT/.dev/run/watchdog-${AGENT}.pid"; kill $WATCHDOG_PID 2>/dev/null; echo "[MBO] Cleanup complete."' EXIT TERM INT

exec 1>&3
node "$ROOT/src/graph/mcp-server.js" "$@"
