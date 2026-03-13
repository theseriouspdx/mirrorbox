#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
node "$ROOT/src/graph/mcp-server.js" --port=7337 --mode=runtime &
SERVER_PID=$!

for i in $(seq 1 30); do
  sleep 1
  curl -sf http://127.0.0.1:7337/health >/dev/null 2>&1 && break
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[FATAL] Graph server exited before /health. Check logs." >&2
    exit 1
  fi
done

curl -sf http://127.0.0.1:7337/health >/dev/null 2>&1 || {
  echo "[FATAL] /health timeout." >&2
  exit 1
}

echo "[MBO] Graph server ready on port 7337."
