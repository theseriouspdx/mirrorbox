#!/usr/bin/env bash
# MBO Universal MCP Loader — Vendor-Agnostic Session Initializer
set -uo pipefail

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Initializing Session Start Protocol..."
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$ROOT/data/mirrorbox.db"
AGENT="operator"
MODE="runtime"

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
        MODE="dev"
        DB_PATH="$ROOT/.dev/data/dev-graph.db"
    elif [[ $arg == --agent=* ]]; then
        AGENT="${arg#--agent=}"
    fi
done

if [[ -n "${MBO_PORT:-}" ]]; then
    PORT="$MBO_PORT"
elif [[ "$MODE" == "dev" ]]; then
    PORT="4737"
else
    PORT="3737"
fi

# Ensure global install dependencies resolve even when launched from external project roots.
export NODE_PATH="$ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"

# If the port is already bound, exit cleanly (the Operator will reuse the
# existing server). Do NOT error — this is the normal warm-restart path.
if lsof -ti:"$PORT" >/dev/null 2>&1; then
    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Port $PORT already bound — MCP server already running. Exiting launcher." >&2
    exit 0
fi
export MBO_PORT="$PORT"

# Write PID file — trap ensures cleanup on crash/unexpected exit
mkdir -p "$ROOT/.dev/run"
PID_FILE="$ROOT/.dev/run/${AGENT}.pid"
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"; echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") PID file cleaned up on exit." >&2' EXIT

# ── Database Integrity & Lock Recovery (non-fatal — warn and continue) ─────────
if [ -f "$DB_PATH" ]; then
    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Verifying: $DB_PATH"
    node -e "
const path = require('path');
const Database = require(path.join('$ROOT', 'node_modules', 'better-sqlite3'));
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

exec node "$ROOT/src/graph/mcp-server.js" "$@" "--root=$ROOT"
