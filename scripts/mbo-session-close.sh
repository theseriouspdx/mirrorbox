#!/usr/bin/env bash
set -euo pipefail

# Bound expensive operations so session-close never hangs forever.
log(){ echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") $*"; }
run_with_timeout() {
  local timeout_s="$1"; shift
  local cmd=("$@")
  "${cmd[@]}" &
  local pid=$!
  (
    sleep "$timeout_s"
    if kill -0 "$pid" 2>/dev/null; then
      log "WARN: Timeout (${timeout_s}s) reached for: ${cmd[*]}"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
    fi
  ) &
  local watchdog=$!
  wait "$pid" || return_code=$?
  kill -TERM "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  return ${return_code:-0}
}

# --terminate-mcp --agent=<name>: graceful MCP process shutdown via PID file
if [[ "${1:-}" == "--terminate-mcp" ]]; then
    AGENT=""
    for arg in "$@"; do
        if [[ $arg == --agent=* ]]; then AGENT="${arg#--agent=}"; fi
    done
    if [[ -z "$AGENT" ]]; then
        echo "ERROR: --agent required with --terminate-mcp" >&2; exit 1
    fi
    ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
    PID_FILE="$ROOT_DIR/.dev/run/${AGENT}.pid"
    if [[ ! -f "$PID_FILE" ]]; then
        echo "[MBO] No PID file for agent '${AGENT}'. Server may not be running." >&2
        exit 0
    fi
    MCP_PID="$(cat "$PID_FILE")"
    if ! kill -0 "$MCP_PID" 2>/dev/null; then
        echo "[MBO] PID ${MCP_PID} is stale (process not found). Cleaning up." >&2
        rm -f "$PID_FILE"; exit 0
    fi
    echo "[MBO] Sending SIGTERM to PID ${MCP_PID} (agent: ${AGENT})..." >&2
    kill -TERM "$MCP_PID"
    for i in $(seq 1 5); do
        sleep 1
        if ! kill -0 "$MCP_PID" 2>/dev/null; then
            echo "[MBO] Process ${MCP_PID} exited cleanly." >&2
            rm -f "$PID_FILE"; exit 0
        fi
    done
    echo "[MBO] Grace period elapsed. Sending SIGKILL to ${MCP_PID}." >&2
    kill -KILL "$MCP_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 0
fi

# --- SESSION CLOSE PROTOCOL (Section 17) ---
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$ROOT_DIR/data/mirrorbox.db"
BACKUP_DIR="$ROOT_DIR/data/backups"
NEXT_DEV="$ROOT_DIR/.dev/sessions/NEXT_SESSION.md"
NEXT_DATA="$ROOT_DIR/data/NEXT_SESSION.md"
GOVERNANCE_DIR="$ROOT_DIR/.dev/governance"

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: Database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# 1. PRAGMA integrity_check + smart backup
STAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/mirrorbox_${STAMP}.bak"
cp "$DB_PATH" "$BACKUP_FILE"

INTEGRITY_RESULT="$(sqlite3 "$BACKUP_FILE" 'PRAGMA integrity_check;' | tr -d '\r')"
SHA256="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
BACKUP_BASENAME="$(basename "$BACKUP_FILE")"

# Smart backup retention: keep 10 if DB is small (<100MB), else keep 3
DB_SIZE_BYTES="$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null || echo 0)"
if [[ "$DB_SIZE_BYTES" -lt 104857600 ]]; then
  KEEP_BACKUPS=10
else
  KEEP_BACKUPS=3
fi

SESSION_STATUS="closed_clean"
if [[ "$INTEGRITY_RESULT" != "ok" ]]; then
  SESSION_STATUS="closed_with_incident"
fi
if [[ -f "$ROOT_DIR/.dev/run/incident.flag" ]]; then
  SESSION_STATUS="closed_with_incident"
fi

# 2. Query Task Summary
LAST_TASK_INFO="$(sqlite3 "$DB_PATH" "SELECT id, name, status FROM tasks ORDER BY id DESC LIMIT 1;" || echo "0|N/A|N/A")"
LAST_TASK_ID=$(echo "$LAST_TASK_INFO" | cut -d'|' -f1)
LAST_TASK_NAME=$(echo "$LAST_TASK_INFO" | cut -d'|' -f2)
LAST_TASK_STATUS=$(echo "$LAST_TASK_INFO" | cut -d'|' -f3)
COMPLETED_COUNT="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tasks WHERE status = 'COMPLETED';" || echo "0")"

# 2.5 Find Next Action from projecttracking.md
# Identifies the Current Milestone section first to ensure correct task selection.
NEXT_TASK_ID="TBD"
NEXT_TASK_DESC="TBD"
TRACKING_FILE="$GOVERNANCE_DIR/projecttracking.md"

if [[ -f "$TRACKING_FILE" ]]; then
  # 1. Identify the Current Milestone section
  MILESTONE_SECTION=$(grep -A 20 "Current Milestone" "$TRACKING_FILE" || true)
  # 2. Find the first 'OPEN' task in that section
  NEXT_ROW=$(echo "$MILESTONE_SECTION" | grep '| OPEN |' | head -n 1 || true)
  
  if [[ -n "$NEXT_ROW" ]]; then
    NEXT_TASK_ID=$(echo "$NEXT_ROW" | awk -F'|' '{print $2}' | xargs)
    NEXT_TASK_DESC=$(echo "$NEXT_ROW" | awk -F'|' '{print $3}' | xargs)
  fi
fi

# 2.6 Cold Storage Snapshot (Mirror World — source only, no data/)
echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Generating Cold Storage Snapshot..."
SNAPSHOT_DIR="$ROOT_DIR/backups"
SNAPSHOT_NAME="mirror_snapshot_$(date +"%Y%m%d_%H%M%S").zip"
SNAPSHOT_PATH="$SNAPSHOT_DIR/$SNAPSHOT_NAME"

# Zip source and governance only — never data/ (contains multi-GB DB and backups)
(cd "$ROOT_DIR" && zip -r "$SNAPSHOT_PATH" \
    src/ bin/ scripts/ .dev/governance/ \
    package.json package-lock.json \
    -x "*/.DS_Store" "*/__pycache__/*" > /dev/null)

SNAPSHOT_SHA="$(shasum -a 256 "$SNAPSHOT_PATH" | awk '{print $1}')"

# Prune: smart retention for DB backups and snapshots
ls -t "$BACKUP_DIR"/mirrorbox_*.bak 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs rm -f || true
ls -t "$SNAPSHOT_DIR"/mirror_snapshot_*.zip 2>/dev/null | tail -n +4 | xargs rm -f || true

# DB health check: compare DB size to src/ size and warn if out of whack
SRC_SIZE_BYTES="$(du -sk "$ROOT_DIR/src" | awk '{print $1 * 1024}')"
DB_SIZE_KB=$(( DB_SIZE_BYTES / 1024 ))
SRC_SIZE_KB=$(( SRC_SIZE_BYTES / 1024 ))
if [[ "$SRC_SIZE_KB" -gt 0 ]]; then
  RATIO=$(( DB_SIZE_BYTES / SRC_SIZE_BYTES ))
  if [[ "$RATIO" -gt 10 ]]; then
    echo "----------------------------------------------------"
    echo "⚠️  WARNING: DB BLOAT DETECTED"
    echo "   mirrorbox.db : ${DB_SIZE_KB} KB"
    echo "   src/         : ${SRC_SIZE_KB} KB"
    echo "   Ratio        : ${RATIO}x (healthy = <10x)"
    echo "   Cause        : likely a runaway event loop writing junk events."
    echo "   Action       : DB will be rebuilt from source now."
    echo "----------------------------------------------------"
  else
    echo "[MBO] DB health OK — ${DB_SIZE_KB}KB db / ${SRC_SIZE_KB}KB src (${RATIO}x ratio)"
  fi
fi

# Rebuild DB: drop and regenerate from source scan (keeps DB tiny)
echo "[MBO] Rebuilding mirrorbox.db from source..."
if run_with_timeout 30 node "$ROOT_DIR/scripts/rebuild-mirror.js" 2>&1 | tail -2; then
  echo "[MBO] DB rebuild complete."
else
  echo "[MBO] WARN: DB rebuild failed or timed out — backup preserved at $BACKUP_FILE" >&2
fi

# Best-effort dev graph freshness bump (non-fatal): if MCP dev server is running,
# trigger graph_rescan so next agent session doesn't start stale.
DEV_PORT="4737"
if lsof -ti:"$DEV_PORT" >/dev/null 2>&1; then
  echo "[MBO] Triggering dev graph_rescan on :$DEV_PORT (best-effort)..."
  CURL_COMMON_ARGS=(
    --silent --show-error
    --connect-timeout 1
    --max-time 4
    --retry 1
    --retry-delay 1
    --retry-connrefused
  )
  MCP_INIT_HEADERS="$(mktemp)"
  MCP_INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mbo-session-close","version":"1.0"}}}'
  INIT_RESP="$(curl "${CURL_COMMON_ARGS[@]}" -D "$MCP_INIT_HEADERS" -X POST "http://127.0.0.1:${DEV_PORT}/mcp" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    --data "$MCP_INIT_BODY" 2>/dev/null || true)"
  MCP_SID="$(awk 'BEGIN{IGNORECASE=1}/^mcp-session-id:/{gsub("\r",""); print $2}' "$MCP_INIT_HEADERS")"
  rm -f "$MCP_INIT_HEADERS"

  if [[ -n "$MCP_SID" ]]; then
    RSCAN_BODY='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"graph_rescan","arguments":{}}}'
    RSCAN_RESP="$(curl "${CURL_COMMON_ARGS[@]}" -X POST "http://127.0.0.1:${DEV_PORT}/mcp" \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      -H "mcp-session-id: $MCP_SID" \
      --data "$RSCAN_BODY" 2>/dev/null || true)"
    if echo "$RSCAN_RESP" | grep -q "event: message"; then
      echo "[MBO] Dev graph_rescan triggered."
    else
      echo "[MBO] WARN: dev graph_rescan trigger did not return expected MCP response." >&2
    fi
  else
    echo "[MBO] WARN: Could not establish MCP session for dev graph_rescan trigger." >&2
  fi
fi

# 3. Generate NEXT_SESSION.md Content
cat > "$NEXT_DATA" <<EOF
# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** $(date -u +"%Y-%m-%d")
**Last task:** ${LAST_TASK_ID}: ${LAST_TASK_NAME} (${LAST_TASK_STATUS})
**Status:** $(if [[ "$LAST_TASK_STATUS" == "COMPLETED" ]]; then echo "Milestone Progressing"; else echo "Task Pending"; fi)

---

## Section 1 — Next Action

**Task ${NEXT_TASK_ID} — ${NEXT_TASK_DESC}**

**Graph queries to run at Gate 0:**
\`\`\`
graph_search("${NEXT_TASK_DESC}")
\`\`\`

---

## Section 2 — Session Summary

- Tasks completed this session: ${COMPLETED_COUNT}
- Unresolved issues: Check BUGS.md for P0/P1 items.

---

## Section 3 — Directory State
(State snapshot captured in mirrorbox.db)

## Session End Checklist
- Status: ${SESSION_STATUS}
- Cold Storage: ${SNAPSHOT_NAME} (SHA-256: ${SNAPSHOT_SHA})
- Backup file: ${BACKUP_BASENAME}
- SHA-256: ${SHA256}
- PRAGMA integrity_check: ${INTEGRITY_RESULT}
- Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

# Copy to .dev/sessions as well
cp "$NEXT_DATA" "$NEXT_DEV"

# 4. nhash Seed Calculation (Section 8)
# X: AGENTS.md NUMBERED sections (e.g. ## Section 1)
# Y: BUGS.md NUMBERED sections
echo "----------------------------------------------------"
echo "Session Handoff Generated: $NEXT_DATA"
echo "Backup Created: $BACKUP_FILE"
echo "PRAGMA integrity_check: $INTEGRITY_RESULT"
echo "SHA-256: $SHA256"
echo "----------------------------------------------------"
echo "Handoff complete. It is now safe to clear context."
echo "----------------------------------------------------"
