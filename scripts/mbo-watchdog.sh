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
  # etime= format is [[dd-]hh:]mm:ss. We parse this into total seconds.
  ETIME_RAW=$(ps -p "$MCP_PID" -o etime= | tr -d ' ')
  if [[ -z "$ETIME_RAW" ]]; then continue; fi

  # Split by days and clock
  if [[ "$ETIME_RAW" == *"-"* ]]; then
    DAYS="${ETIME_RAW%%-*}"
    CLOCK="${ETIME_RAW#*-}"
  else
    DAYS=0
    CLOCK="$ETIME_RAW"
  fi

  # Parse clock components (hh:mm:ss or mm:ss)
  IFS=: read -r -a PARTS <<< "$CLOCK"
  if [[ ${#PARTS[@]} -eq 3 ]]; then
    ELAPSED_SEC=$(( (10#$DAYS * 86400) + (10#${PARTS[0]} * 3600) + (10#${PARTS[1]} * 60) + 10#${PARTS[2]} ))
  elif [[ ${#PARTS[@]} -eq 2 ]]; then
    ELAPSED_SEC=$(( (10#$DAYS * 86400) + (10#${PARTS[0]} * 60) + 10#${PARTS[1]} ))
  else
    ELAPSED_SEC=$(( (10#$DAYS * 86400) + 10#${PARTS[0]} ))
  fi

  if (( ELAPSED_SEC > TIMEOUT_SEC )); then
    echo "[WATCHDOG] Process ${MCP_PID} exceeded timeout (${ELAPSED_SEC}s > ${TIMEOUT_SEC}s); enforcing policy"
    kill -TERM "$MCP_PID" 2>/dev/null || true
    sleep 5
    kill -KILL "$MCP_PID" 2>/dev/null || true
  fi
done
