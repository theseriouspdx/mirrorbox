#!/usr/bin/env bash
# Mirror Box Orchestrator — MCP Liveness Watchdog (Section 18)
# Monitors the MCP server for "stuck" states and kills ONLY unresponsive processes.
# A process that responds to an HTTP probe (even with 4xx) is considered healthy.

CHECK_INTERVAL=5
# Number of consecutive failed probes before declaring the process stuck.
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
# HTTP probe connect+response timeout in seconds.
PROBE_TIMEOUT="${PROBE_TIMEOUT:-5}"
AGENT="${1:-operator}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.dev/run/${AGENT}.pid"

echo "[WATCHDOG] Monitoring agent: ${AGENT} (probe every ${CHECK_INTERVAL}s, fail threshold: ${FAIL_THRESHOLD})"

CONSECUTIVE_FAILURES=0

while true; do
  sleep $CHECK_INTERVAL

  if [[ ! -f "$PID_FILE" ]]; then
    CONSECUTIVE_FAILURES=0
    continue
  fi

  MCP_PID="$(cat "$PID_FILE")"
  if ! kill -0 "$MCP_PID" 2>/dev/null; then
    CONSECUTIVE_FAILURES=0
    continue
  fi

  # Read port from manifest — dev path first, runtime fallback.
  # If manifest is missing or server isn't ready, skip this probe cycle.
  PORT="$(node -e "
const fs = require('fs');
const paths = [
  '$ROOT_DIR/.dev/run/mcp.json',
  '$ROOT_DIR/.mbo/run/mcp.json'
];
for (const p of paths) {
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (m.manifest_version === 3 && m.port && m.status === 'ready') {
      console.log(m.port);
      process.exit(0);
    }
  } catch (_) {}
}
process.exit(1);
  " 2>/dev/null)" || {
    echo "[WATCHDOG] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Manifest missing or server not ready — skipping probe cycle."
    CONSECUTIVE_FAILURES=0
    continue
  }

  if [[ -z "$PORT" ]]; then
    echo "[WATCHDOG] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Could not resolve port from manifest — skipping probe cycle."
    CONSECUTIVE_FAILURES=0
    continue
  fi

  # HTTP liveness probe — any response (including 4xx) means the server is alive.
  # Only a connection failure or timeout means it is stuck.
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time "$PROBE_TIMEOUT" \
    --connect-timeout "$PROBE_TIMEOUT" \
    -X GET "http://127.0.0.1:${PORT}/mcp" 2>/dev/null)
  CURL_EXIT=$?

  if [[ $CURL_EXIT -eq 0 ]] || [[ "$HTTP_CODE" =~ ^[1-5][0-9][0-9]$ ]]; then
    # Server responded — healthy, reset failure counter.
    if (( CONSECUTIVE_FAILURES > 0 )); then
      echo "[WATCHDOG] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Process ${MCP_PID} recovered (HTTP ${HTTP_CODE}); resetting failure count."
    fi
    CONSECUTIVE_FAILURES=0
  else
    # No response or connection refused — increment failure counter.
    CONSECUTIVE_FAILURES=$(( CONSECUTIVE_FAILURES + 1 ))
    echo "[WATCHDOG] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Process ${MCP_PID} probe failed (curl exit: ${CURL_EXIT}, consecutive: ${CONSECUTIVE_FAILURES}/${FAIL_THRESHOLD})"

    if (( CONSECUTIVE_FAILURES >= FAIL_THRESHOLD )); then
      echo "[WATCHDOG] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Process ${MCP_PID} declared stuck after ${FAIL_THRESHOLD} consecutive failures; enforcing policy."
      kill -TERM "$MCP_PID" 2>/dev/null || true
      sleep 5
      kill -KILL "$MCP_PID" 2>/dev/null || true
      CONSECUTIVE_FAILURES=0
    fi
  fi
done
