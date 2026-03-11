#!/usr/bin/env bash
# MBO Universal MCP Loader — Vendor-Agnostic Session Initializer
set -uo pipefail

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Initializing Session Start Protocol..."
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$ROOT/data/mirrorbox.db"
AGENT="operator"
PORT="${MBO_PORT:-3737}"

# ── nvm bootstrap ─────────────────────────────────────────────────────────────
# When launched by launchd, the user's shell profile is not sourced, so nvm is
# not on PATH. Source nvm directly so node is available regardless of PATH env.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh" --no-use
    nvm use default --silent 2>/dev/null || true
fi

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
trap 'rm -f "$PID_FILE"; echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") PID file cleaned up on exit." >&2' EXIT

# ── Port Pre-Flight ────────────────────────────────────────────────────────────
# If a stale process is still bound to PORT, kill it before starting.
# launchd handles respawn; the watchdog is no longer needed.
STUCK_PID="$(lsof -ti:"$PORT" 2>/dev/null || true)"
if [ -n "$STUCK_PID" ]; then
    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Clearing port $PORT (PID $STUCK_PID)..."
    kill -TERM "$STUCK_PID" 2>/dev/null || true
    sleep 1
    # Second check — SIGKILL if still alive
    if kill -0 "$STUCK_PID" 2>/dev/null; then
        echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Still alive after SIGTERM — sending SIGKILL to $STUCK_PID..."
        kill -KILL "$STUCK_PID" 2>/dev/null || true
    fi
fi

# ── Database Integrity & Lock Recovery (non-fatal — warn and continue) ─────────
if [ -f "$DB_PATH" ]; then
    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Verifying: $DB_PATH"
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
    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") [WARN] Database not found at $DB_PATH — server will create on first use."
fi

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Environment verified. Launching HTTP MCP server on port $PORT..."

exec node "$ROOT/src/graph/mcp-server.js" "$@"
