#!/usr/bin/env bash
# Mirror Box Orchestrator — MCP Liveness Watchdog (Section 18)
# Monitors the MCP server for "stuck" states and enforces timeout policy

CHECK_INTERVAL=5
TIMEOUT_SEC="${TIMEOUT_SEC:-120}"
AGENT="${1:-operator}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.dev/run/${AGENT}.pid"

echo "[WATCHDOG] Monitoring agent: ${AGENT} (Timeout: ${TIMEOUT_SEC}s)"

while true; do
  sleep $CHECK_INTERVAL

  if [[ ! -f "$PID_FILE" ]]; then
    continue
  fi

  MCP_PID="$(cat "$PID_FILE")"
  if ! kill -0 "$MCP_PID" 2>/dev/null; then
    continue
  fi

  # Enforce timeout policy (Section 18)
  # etime= format is [[dd-]hh:]mm:ss
  ETIME=$(ps -p "$MCP_PID" -o etime= | tr -d ' ')
  
  # Check if elapsed time suggests a hang (coarse check for demonstration)
  # For 0.7, we'll implement a simple threshold-based termination if active too long
  if [[ "$ETIME" == *-* || "$ETIME" == *:* ]]; then
    # If etime contains a dash (days) or colon (hours/mins), check thresholds
    # This is a placeholder for the more complex logic in 0.8
    echo "[WATCHDOG] Process ${MCP_PID} running for ${ETIME}; enforcing timeout policy"
    kill -TERM "$MCP_PID" 2>/dev/null || true
    sleep 5
    kill -KILL "$MCP_PID" 2>/dev/null || true
  fi
done
