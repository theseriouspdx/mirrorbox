#!/usr/bin/env bash
# MBO Universal MCP Loader — Vendor-Agnostic Session Initializer
set -uo pipefail

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Initializing Session Start Protocol..."
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="${MBO_PROJECT_ROOT:-$ROOT}"
DB_PATH="$PROJECT_ROOT/.mbo/mirrorbox.db"
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
        PROJECT_ROOT="$ROOT"
    elif [[ $arg == --agent=* ]]; then
        AGENT="${arg#--agent=}"
    fi
done

if [[ -n "${MBO_PORT:-}" ]]; then
    PORT="$MBO_PORT"
else
    PORT="$(node -e "const net=require('net');const s=net.createServer();s.on('error',()=>{console.log(3737)});s.listen(0,()=>{console.log(s.address().port);s.close();});")"
fi

# Ensure global install dependencies resolve even when launched from external project roots.
export NODE_PATH="$ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"

export MBO_PORT="$PORT"

if [[ -z "$MBO_PORT" ]]; then
    MBO_PORT="3737"
    export MBO_PORT
fi

# Write PID file — trap ensures cleanup on crash/unexpected exit
RUN_DIR="$PROJECT_ROOT/.mbo/run"
if [[ "$MODE" == "dev" ]]; then
    RUN_DIR="$ROOT/.dev/run"
fi
mkdir -p "$RUN_DIR"
PID_FILE="$RUN_DIR/${AGENT}.pid"
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

exec node "$ROOT/src/graph/mcp-server.js" "$@" "--root=$PROJECT_ROOT"
