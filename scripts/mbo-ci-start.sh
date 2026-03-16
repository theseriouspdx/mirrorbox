#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
node "$ROOT/src/graph/mcp-server.js" --port=0 --mode=runtime &
SERVER_PID=$!

MANIFEST="$ROOT/.dev/run/mcp.json"
PORT=""

for i in $(seq 1 30); do
  sleep 1
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[FATAL] Graph server exited before /health. Check logs." >&2
    exit 1
  fi
  if [ -f "$MANIFEST" ]; then
    PORT=$(node -e "try{console.log(require('$MANIFEST').port)}catch(e){}" 2>/dev/null || true)
    [ -n "$PORT" ] && curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break
  fi
done

[ -z "$PORT" ] && { echo "[FATAL] No port in manifest after 30s." >&2; exit 1; }
curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || {
  echo "[FATAL] /health timeout on port ${PORT}." >&2
  exit 1
}

echo "[MBO] Graph server ready on port ${PORT}."
