#!/usr/bin/env bash
# MBO Universal MCP Loader — Vendor-Agnostic Session Initializer
set -uo pipefail

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Initializing Session Start Protocol..."
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="${MBO_PROJECT_ROOT:-$ROOT}"
DB_PATH="$PROJECT_ROOT/.mbo/mirrorbox.db"
AGENT="operator"
MODE="runtime"

# ── nvm bootstrap ──────────────────────────────────────────────────────────────
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

# ── Port selection ─────────────────────────────────────────────────────────────
# Fail loud if we can't pick a port — never silently fall back to 3737.
if [[ -n "${MBO_PORT:-}" ]]; then
    PORT="$MBO_PORT"
else
    PORT="$(node -e "
const net = require('net');
const s = net.createServer();
s.on('error', (e) => { process.stderr.write('[FATAL] Port probe failed: ' + e.message + '\n'); process.exit(1); });
s.listen(0, () => { console.log(s.address().port); s.close(); });
    ")" || { echo "[FATAL] Port selection failed — cannot start MCP server." >&2; exit 1; }
fi

if [[ -z "$PORT" ]]; then
    echo "[FATAL] Port is empty after selection — cannot start MCP server." >&2
    exit 1
fi

export MBO_PORT="$PORT"
export NODE_PATH="$ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"

# ── Run directory ──────────────────────────────────────────────────────────────
RUN_DIR="$PROJECT_ROOT/.mbo/run"
if [[ "$MODE" == "dev" ]]; then
    RUN_DIR="$ROOT/.dev/run"
fi
mkdir -p "$RUN_DIR"

# Remove stale sentinel so _waitForMCPReady never races on a previous run's file.
rm -f "$RUN_DIR/mcp.ready"

PID_FILE="$RUN_DIR/${AGENT}.pid"
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"; echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") PID file cleaned up on exit." >&2' EXIT

# ── Database integrity check (non-fatal) ───────────────────────────────────────
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

# ── Launch MCP server in background ───────────────────────────────────────────
# We no longer use `exec` because we need the shell to remain alive long enough
# to sync .mcp.json and .gemini/settings.json after the server writes its port.
echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Launching HTTP MCP server on port $PORT (background)..."

node "$ROOT/src/graph/mcp-server.js" "$@" "--root=$PROJECT_ROOT" &
NODE_PID=$!

# Forward SIGTERM/SIGINT to the node child so callers can cleanly stop us.
trap 'kill -TERM "$NODE_PID" 2>/dev/null; wait "$NODE_PID"; rm -f "$PID_FILE"' TERM INT

# ── Wait for server ready sentinel ────────────────────────────────────────────
SENTINEL="$RUN_DIR/mcp.ready"
MANIFEST="$RUN_DIR/mcp.json"
TIMEOUT=30
ELAPSED=0
echo "[MBO] Waiting for sentinel: $SENTINEL (timeout ${TIMEOUT}s)..."

while [[ ! -f "$SENTINEL" ]]; do
    if ! kill -0 "$NODE_PID" 2>/dev/null; then
        echo "[FATAL] MCP server process died before writing sentinel. Check logs." >&2
        exit 1
    fi
    if (( ELAPSED >= TIMEOUT )); then
        echo "[FATAL] MCP server did not write sentinel within ${TIMEOUT}s. Check .dev/logs/mcp-stderr.log" >&2
        kill -TERM "$NODE_PID" 2>/dev/null
        exit 1
    fi
    sleep 0.2
    (( ELAPSED++ )) || true
done

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Sentinel detected. Server is ready."

# ── Sync agent config files to live port ──────────────────────────────────────
LIVE_PORT="$(node -e "
const fs = require('fs');
try {
    const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
    if (m.status === 'ready' && m.port) { console.log(m.port); }
    else { process.exit(1); }
} catch(e) { process.exit(1); }
")" || { echo "[WARN] Could not read live port from manifest — skipping config sync." >&2; LIVE_PORT=""; }

if [[ -n "$LIVE_PORT" ]]; then
    MCP_URL="http://127.0.0.1:${LIVE_PORT}/mcp"

    # .mcp.json — Claude Code / claude.ai config
    MCP_JSON="$ROOT/.mcp.json"
    if [[ -f "$MCP_JSON" ]]; then
        node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$MCP_JSON', 'utf8'));
const servers = cfg.mcpServers || {};
let updated = false;
for (const key of Object.keys(servers)) {
    if (servers[key] && servers[key].url !== undefined) {
        servers[key].url = '$MCP_URL';
        updated = true;
    }
}
if (updated) {
    fs.writeFileSync('$MCP_JSON', JSON.stringify(cfg, null, 2) + '\n');
    console.error('[MBO] .mcp.json synced to port $LIVE_PORT');
}
        " || echo "[WARN] Failed to update .mcp.json" >&2
    fi

    # .gemini/settings.json — Gemini CLI config
    GEMINI_CFG="$ROOT/.gemini/settings.json"
    if [[ -f "$GEMINI_CFG" ]]; then
        node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$GEMINI_CFG', 'utf8'));
const servers = cfg.mcpServers || {};
let updated = false;
for (const key of Object.keys(servers)) {
    if (servers[key] && servers[key].url !== undefined) {
        servers[key].url = '$MCP_URL';
        updated = true;
    }
}
if (updated) {
    fs.writeFileSync('$GEMINI_CFG', JSON.stringify(cfg, null, 2) + '\n');
    console.error('[MBO] .gemini/settings.json synced to port $LIVE_PORT');
}
        " || echo "[WARN] Failed to update .gemini/settings.json" >&2
    fi

    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") MCP server live on port $LIVE_PORT — all configs synced."
fi

# Keep this script alive as process group owner so callers can wait/kill us.
wait "$NODE_PID"
