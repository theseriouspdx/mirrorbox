#!/usr/bin/env bash
# MBO Universal MCP Loader — Vendor-Agnostic Session Initializer
set -euo pipefail

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

# Write PID file before exec (exec replaces this bash PID with node's PID — file remains valid)
if [[ "$AGENT" != "operator" ]]; then
    mkdir -p "$ROOT/.dev/run"
    echo $$ > "$ROOT/.dev/run/${AGENT}.pid"
fi

# Database Integrity & Lock Recovery
if [ -f "$DB_PATH" ]; then
    echo "[MBO] Verifying: $DB_PATH"
    node -e "
const Database = require('better-sqlite3');
try {
    const db = new Database('$DB_PATH', { timeout: 5000 });
    const check = db.prepare('PRAGMA integrity_check').get();
    if (check.integrity_check !== 'ok') {
        console.error('[CRITICAL] DB Integrity Failure:', check);
        process.exit(1);
    }
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
    db.close();
    process.exit(0);
} catch (e) {
    console.error('[CRITICAL] DB Access Error:', e.message);
    process.exit(1);
}"
else
    echo "[WARN] Database not found at $DB_PATH."
fi

echo "[MBO] Environment Verified. Launching MCP..."
exec 1>&3
exec node "$ROOT/src/graph/mcp-server.js" "$@"
