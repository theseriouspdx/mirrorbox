#!/usr/bin/env bash
set -euo pipefail

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

# 1. PRAGMA integrity_check
STAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/mirrorbox_${STAMP}.bak"
cp "$DB_PATH" "$BACKUP_FILE"

INTEGRITY_RESULT="$(sqlite3 "$BACKUP_FILE" 'PRAGMA integrity_check;' | tr -d '\r')"
SHA256="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
BACKUP_BASENAME="$(basename "$BACKUP_FILE")"

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
# Looks for the first 'OPEN' task in the 'Current Milestone' section
NEXT_TASK_ID="TBD"
NEXT_TASK_DESC="TBD"
TRACKING_FILE="$GOVERNANCE_DIR/projecttracking.md"

if [[ -f "$TRACKING_FILE" ]]; then
  # Find the first row in a table that contains '| OPEN |'
  NEXT_ROW=$(grep '| OPEN |' "$TRACKING_FILE" | head -n 1 || true)
  if [[ -n "$NEXT_ROW" ]]; then
    NEXT_TASK_ID=$(echo "$NEXT_ROW" | awk -F'|' '{print $2}' | xargs)
    NEXT_TASK_DESC=$(echo "$NEXT_ROW" | awk -F'|' '{print $3}' | xargs)
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

