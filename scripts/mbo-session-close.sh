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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTROLLER_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -n "${MBO_PROJECT_ROOT:-}" ]]; then
  ROOT_DIR="$(cd "$MBO_PROJECT_ROOT" && pwd)"
else
  ROOT_DIR="$CONTROLLER_ROOT"
fi
DB_PATH_DATA="$ROOT_DIR/data/mirrorbox.db"
DB_PATH_MBO="$ROOT_DIR/.mbo/mirrorbox.db"
if [[ -f "$DB_PATH_DATA" ]]; then
  DB_PATH="$DB_PATH_DATA"
elif [[ -f "$DB_PATH_MBO" ]]; then
  DB_PATH="$DB_PATH_MBO"
else
  DB_PATH=""
fi
if [[ "$DB_PATH" == "$DB_PATH_MBO" ]]; then
  BACKUP_DIR="$ROOT_DIR/.mbo/backups"
else
  BACKUP_DIR="$ROOT_DIR/data/backups"
fi
NEXT_ROOT="$ROOT_DIR/NEXT_SESSION.md"
NEXT_DEV="$ROOT_DIR/.dev/sessions/NEXT_SESSION.md"
NEXT_DATA="$ROOT_DIR/data/NEXT_SESSION.md"
GOVERNANCE_DIR="$ROOT_DIR/.dev/governance"

if [[ -z "$DB_PATH" || ! -f "$DB_PATH" ]]; then
  echo "ERROR: Database not found at $DB_PATH_DATA or $DB_PATH_MBO" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$NEXT_DEV")"
mkdir -p "$(dirname "$NEXT_DATA")"

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
LAST_TASK_INFO="$(sqlite3 "$DB_PATH" "SELECT id, name, status FROM tasks ORDER BY id DESC LIMIT 1;" || true)"
LAST_TASK_ID=$(echo "$LAST_TASK_INFO" | cut -d'|' -f1)
LAST_TASK_NAME=$(echo "$LAST_TASK_INFO" | cut -d'|' -f2)
LAST_TASK_STATUS=$(echo "$LAST_TASK_INFO" | cut -d'|' -f3)
if [[ -z "$LAST_TASK_ID" ]]; then LAST_TASK_ID="N/A"; fi
if [[ -z "$LAST_TASK_NAME" ]]; then LAST_TASK_NAME="No task recorded in DB"; fi
if [[ -z "$LAST_TASK_STATUS" ]]; then LAST_TASK_STATUS="N/A"; fi
COMPLETED_COUNT="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tasks WHERE status = 'COMPLETED';" || echo "0")"

# 2.5 Find Next Action from canonical task ledger (`**Next Task:**`)
NEXT_TASK_ID="TBD"
NEXT_TASK_TITLE="TBD"
NEXT_TASK_STATUS="TBD"
TRACKING_FILE="$GOVERNANCE_DIR/projecttracking.md"
if [[ ! -f "$TRACKING_FILE" && -f "$ROOT_DIR/projecttracking.md" ]]; then
  TRACKING_FILE="$ROOT_DIR/projecttracking.md"
fi

if [[ -f "$TRACKING_FILE" ]]; then
  DECLARED_NEXT_TASK="$(sed -n 's/^\*\*Next Task:\*\* //p' "$TRACKING_FILE" | head -n 1 | xargs || true)"
  if [[ -n "$DECLARED_NEXT_TASK" ]]; then
    NEXT_ROW=$(awk -F'|' -v tid="$DECLARED_NEXT_TASK" '
      BEGIN { have_header=0 }
      /^\| Task ID \| Type \| Title \| Status \| Owner \| Branch \| Updated \| Links \| Acceptance \|$/ { have_header=1; next }
      have_header && /^\|---/ { next }
      have_header && /^\|/ {
        id=$2; gsub(/^ +| +$/, "", id)
        if (id == tid) { print $0; exit }
      }
    ' "$TRACKING_FILE" | head -n 1 || true)

    if [[ -n "$NEXT_ROW" ]]; then
      NEXT_TASK_ID=$(echo "$NEXT_ROW" | awk -F'|' '{print $2}' | xargs)
      NEXT_TASK_TITLE=$(echo "$NEXT_ROW" | awk -F'|' '{print $4}' | xargs)
      NEXT_TASK_STATUS=$(echo "$NEXT_ROW" | awk -F'|' '{print $5}' | xargs)
    fi
  fi
fi

# 2.6 Open P0/P1 bug blockers for next task
BUGS_FILE="$GOVERNANCE_DIR/BUGS.md"
BLOCKERS="None"
if [[ -f "$BUGS_FILE" && "$NEXT_TASK_ID" != "TBD" ]]; then
  BLOCKERS=$(awk -v tid="$NEXT_TASK_ID" '
    BEGIN { bug=""; sev=""; stat=""; task=""; out="" }
    /^### BUG-/ {
      if (bug != "" && (sev=="P0" || sev=="P1") && stat ~ /(OPEN|PARTIAL)/ && task == tid) {
        if (out != "") out = out "\n"
        id = bug
        sub(/^### /, "", id)
        title = id
        sub(/^BUG-[0-9]+:[[:space:]]*/, "", title)
        split(title, seg, /[|]/)
        title = seg[1]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", title)
        match(id, /^BUG-[0-9]+/)
        bugid = substr(id, RSTART, RLENGTH)
        out = out "- " bugid ": " title
      }
      bug=$0; sev=""; stat=""; task=""
      next
    }
    /^- \*\*Severity:\*\*/ {
      line=$0; sub(/^.*\*\*Severity:\*\* /, "", line)
      split(line, a, " "); sev=a[1]
      next
    }
    /^- \*\*Status:\*\*/ {
      line=$0; sub(/^.*\*\*Status:\*\* /, "", line)
      stat=line
      next
    }
    /^- \*\*Task:\*\*/ {
      line=$0; sub(/^.*\*\*Task:\*\* /, "", line)
      split(line, a, /[ ,]/); task=a[1]
      next
    }
    END {
      if (bug != "" && (sev=="P0" || sev=="P1") && stat ~ /(OPEN|PARTIAL)/ && task == tid) {
        if (out != "") out = out "\n"
        id = bug
        sub(/^### /, "", id)
        title = id
        sub(/^BUG-[0-9]+:[[:space:]]*/, "", title)
        split(title, seg, /[|]/)
        title = seg[1]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", title)
        match(id, /^BUG-[0-9]+/)
        bugid = substr(id, RSTART, RLENGTH)
        out = out "- " bugid ": " title
      }
      if (out == "") print "None"
      else print out
    }
  ' "$BUGS_FILE")
fi

# 2.7 Cold Storage Snapshot (Mirror World — source only, no data/)
echo "[MBO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") Generating Cold Storage Snapshot..."
SNAPSHOT_DIR="$ROOT_DIR/backups"
SNAPSHOT_NAME="mirror_snapshot_$(date +"%Y%m%d_%H%M%S").zip"
SNAPSHOT_PATH="$SNAPSHOT_DIR/$SNAPSHOT_NAME"
mkdir -p "$SNAPSHOT_DIR"

# Zip code/governance paths when present — never data/ (can be very large).
ZIP_INPUTS=()
for p in src bin scripts .dev/governance package.json package-lock.json; do
  [[ -e "$ROOT_DIR/$p" ]] && ZIP_INPUTS+=("$p")
done
if [[ ${#ZIP_INPUTS[@]} -gt 0 ]]; then
  (cd "$ROOT_DIR" && zip -r "$SNAPSHOT_PATH" "${ZIP_INPUTS[@]}" \
      -x "*/.DS_Store" "*/__pycache__/*" > /dev/null)
else
  # Keep a deterministic artifact even when no standard inputs exist.
  (cd "$ROOT_DIR" && zip -r "$SNAPSHOT_PATH" . \
      -x "data/*" "node_modules/*" "*/.DS_Store" "*/__pycache__/*" > /dev/null)
fi

SNAPSHOT_SHA="$(shasum -a 256 "$SNAPSHOT_PATH" | awk '{print $1}')"

# Prune: smart retention for DB backups and snapshots
ls -t "$BACKUP_DIR"/mirrorbox_*.bak 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs rm -f || true
ls -t "$SNAPSHOT_DIR"/mirror_snapshot_*.zip 2>/dev/null | tail -n +4 | xargs rm -f || true

# DB health check: compare DB size to src/ size and warn if out of whack
if [[ -d "$ROOT_DIR/src" ]]; then
  SRC_SIZE_BYTES="$(du -sk "$ROOT_DIR/src" | awk '{print $1 * 1024}')"
else
  SRC_SIZE_BYTES=0
fi
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
if [[ -d "$ROOT_DIR/src" && -f "$CONTROLLER_ROOT/scripts/rebuild-mirror.js" ]]; then
  echo "[MBO] Rebuilding mirrorbox.db from source..."
  if MBO_PROJECT_ROOT="$ROOT_DIR" run_with_timeout 30 node "$CONTROLLER_ROOT/scripts/rebuild-mirror.js" 2>&1 | tail -2; then
    echo "[MBO] DB rebuild complete."
  else
    echo "[MBO] WARN: DB rebuild failed or timed out — backup preserved at $BACKUP_FILE" >&2
  fi
else
  echo "[MBO] Skipping DB rebuild (no src/ or rebuild script unavailable for this runtime project)."
fi

# Best-effort dev graph freshness bump (non-fatal): if MCP dev server is running,
# trigger graph_rescan_changed so next agent session doesn't start stale.
# Port is resolved from the live .gemini/settings.json (written by the server on every start),
# falling back to the manifest symlink, then the legacy fixed port.
DEV_PORT=""
SETTINGS_JSON="$ROOT_DIR/.gemini/settings.json"
if [[ -f "$SETTINGS_JSON" ]]; then
  DEV_PORT="$(python3 -c "
import json, sys
try:
    d = json.load(open('$SETTINGS_JSON'))
    url = d.get('mcpServers',{}).get('mbo-graph',{}).get('url','')
    if url:
        print(url.split(':')[2].split('/')[0])
except: pass
" 2>/dev/null || true)"
fi
if [[ -z "$DEV_PORT" ]]; then
  MCP_MANIFEST="$ROOT_DIR/.dev/run/mcp.json"
  if [[ -f "$MCP_MANIFEST" ]] || [[ -L "$MCP_MANIFEST" ]]; then
    DEV_PORT="$(python3 -c "
import json, sys
try:
    d = json.load(open('$MCP_MANIFEST'))
    print(d.get('port',''))
except: pass
" 2>/dev/null || true)"
  fi
fi
if [[ -z "$DEV_PORT" ]]; then
  DEV_PORT="4737"
fi

if lsof -ti:"$DEV_PORT" >/dev/null 2>&1; then
  echo "[MBO] Triggering dev graph_rescan_changed on :$DEV_PORT (best-effort)..."
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
    RSCAN_BODY='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"graph_rescan_changed","arguments":{}}}'
    RSCAN_RESP="$(curl "${CURL_COMMON_ARGS[@]}" -X POST "http://127.0.0.1:${DEV_PORT}/mcp" \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      -H "mcp-session-id: $MCP_SID" \
      --data "$RSCAN_BODY" 2>/dev/null || true)"
    if echo "$RSCAN_RESP" | grep -q "event: message"; then
      echo "[MBO] Dev graph_rescan_changed triggered."
    else
      echo "[MBO] WARN: dev graph_rescan_changed trigger did not return expected MCP response." >&2
    fi
  else
    echo "[MBO] WARN: Could not establish MCP session for dev graph_rescan_changed trigger." >&2
  fi
fi

# 3. Generate NEXT_SESSION.md Content
cat > "$NEXT_ROOT" <<EOF
# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** $(date -u +"%Y-%m-%d")
**Last task:** ${LAST_TASK_ID}: ${LAST_TASK_NAME} (${LAST_TASK_STATUS})
**Status:** $(if [[ "$LAST_TASK_STATUS" == "COMPLETED" ]]; then echo "Milestone Progressing"; else echo "Task Pending"; fi)

---

## Section 1 — Next Action

**Task ${NEXT_TASK_ID} — ${NEXT_TASK_TITLE}**

- Status: ${NEXT_TASK_STATUS}
- Linked P0/P1 blockers:
${BLOCKERS}

**Graph queries to run at Gate 0:**
\`\`\`
graph_search("${NEXT_TASK_TITLE}")
\`\`\`

---

## Section 2 — Session Summary

- Tasks completed this session: ${COMPLETED_COUNT}
- Canonical workflow: projecttracking.md is source of truth, BUGS.md links to task IDs, NEXT_SESSION.md is generated.

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

# Sync all handoff locations for backward compatibility.
cp "$NEXT_ROOT" "$NEXT_DATA"
cp "$NEXT_ROOT" "$NEXT_DEV"

# 4. nhash Seed Calculation (Section 8)
# X: AGENTS.md NUMBERED sections (e.g. ## Section 1)
# Y: BUGS.md NUMBERED sections
echo "----------------------------------------------------"
echo "Session Handoff Generated: $NEXT_ROOT"
echo "Backup Created: $BACKUP_FILE"
echo "PRAGMA integrity_check: $INTEGRITY_RESULT"
echo "SHA-256: $SHA256"
echo "----------------------------------------------------"
echo "Handoff complete. It is now safe to clear context."
echo "----------------------------------------------------"
