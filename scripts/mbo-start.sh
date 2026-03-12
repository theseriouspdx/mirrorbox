#!/usr/bin/env bash
# MBO Universal MCP Loader — Vendor-Agnostic Session Initializer
set -uo pipefail

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Initializing Session Start Protocol..."
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# Canonicalize root (symlink-safe) so project_id derivation matches server/operator trust checks.
PROJECT_ROOT="$(cd "${MBO_PROJECT_ROOT:-$ROOT}" 2>/dev/null && pwd -P || echo "${MBO_PROJECT_ROOT:-$ROOT}")"
export MBO_PROJECT_ROOT="$PROJECT_ROOT"
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
# Prefer previous ready manifest port for stability. Fall back to dynamic free port.
MANIFEST_PORT="$(node -e "
const fs = require('fs');
const path = require('path');
const root = process.argv[1];
const mode = process.argv[2];
const runDir = mode === 'dev' ? path.join(root, '.dev', 'run') : path.join(root, '.mbo', 'run');
const manifestPath = path.join(runDir, 'mcp.json');
try {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (m && m.manifest_version === 3 && Number.isInteger(m.port) && m.port > 0) {
    process.stdout.write(String(m.port));
  }
} catch (_) {}
" "$PROJECT_ROOT" "$MODE" 2>/dev/null)"

if [[ -n "${MBO_PORT:-}" ]]; then
    PORT="$MBO_PORT"
elif [[ -n "$MANIFEST_PORT" ]]; then
    PORT="$MANIFEST_PORT"
else
    PORT="$(node -e "
const net = require('net');
const s = net.createServer();
s.on('error', (e) => { process.stderr.write('[FATAL] Port probe failed: ' + e.message + '\n'); process.exit(1); });
s.listen(0, '127.0.0.1', () => {
  const a = s.address();
  if (!a || !a.port) process.exit(1);
  console.log(a.port);
  s.close();
});
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

# Remove stale sentinel so readiness checks cannot pass from old runs.
rm -f "$RUN_DIR/mcp.ready"

PID_FILE="$RUN_DIR/${AGENT}.pid"

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

is_port_live() {
  local port="$1"
  node -e "
const net = require('net');
const port = Number(process.argv[1]);
const sock = net.createConnection({ host: '127.0.0.1', port });
sock.setTimeout(500);
sock.on('connect', () => { sock.destroy(); process.exit(0); });
sock.on('timeout', () => { sock.destroy(); process.exit(1); });
sock.on('error', () => process.exit(1));
" "$port" >/dev/null 2>&1
}

# If a server is already live on the expected port, skip spawn and sync configs.
if is_port_live "$PORT"; then
    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Existing MCP server detected on port $PORT — skipping spawn."
    LIVE_PORT="$PORT"
else
    echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Launching HTTP MCP server on port $PORT (detached)..."

    LOG_DIR="$ROOT/.dev/logs"
    mkdir -p "$LOG_DIR"
    LOG_FILE="$LOG_DIR/mcp-stderr.log"

    # True detachment: nohup + explicit stdio redirection + disown, no wait.
    nohup node "$ROOT/src/graph/mcp-server.js" "$@" "--root=$PROJECT_ROOT" >>"$LOG_FILE" 2>&1 < /dev/null &
    NODE_PID=$!
    disown "$NODE_PID" 2>/dev/null || true

    SENTINEL="$RUN_DIR/mcp.ready"
    MANIFEST="$RUN_DIR/mcp.json"
    ATTEMPTS=150
    SLEEP_SEC=0.2

    for ((i=1; i<=ATTEMPTS; i++)); do
        if [[ -f "$SENTINEL" ]]; then
            break
        fi
        if ! kill -0 "$NODE_PID" 2>/dev/null; then
            echo "[FATAL] Detached MCP server exited before readiness. Check $LOG_FILE" >&2
            exit 1
        fi
        sleep "$SLEEP_SEC"
    done

    if [[ ! -f "$SENTINEL" ]]; then
        echo "[FATAL] MCP server did not write readiness sentinel within 30s. Check $LOG_FILE" >&2
        exit 1
    fi

    # Read live port from manifest (retry handles sentinel/manifest write ordering).
    LIVE_PORT=""
    for ((i=1; i<=10; i++)); do
        LIVE_PORT="$(node -e "
const fs = require('fs');
try {
  const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
  if (m && Number.isInteger(m.port) && m.port > 0 && m.status === 'ready') {
    process.stdout.write(String(m.port));
  }
} catch (_) {}
" 2>/dev/null)"
        if [[ -n "$LIVE_PORT" ]]; then
            break
        fi
        sleep 0.1
    done

    if [[ -z "$LIVE_PORT" ]]; then
        echo "[FATAL] Could not resolve live port from manifest after readiness sentinel." >&2
        exit 1
    fi

    if ! is_port_live "$LIVE_PORT"; then
        echo "[FATAL] MCP manifest reports port $LIVE_PORT but TCP probe failed." >&2
        exit 1
    fi

    # Only publish PID file after readiness + live probe confirmation.
    echo "$NODE_PID" > "$PID_FILE"
fi

if [[ -z "${LIVE_PORT:-}" ]]; then
    LIVE_PORT="$PORT"
fi

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

echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") MCP server live on port $LIVE_PORT — startup complete."
exit 0
