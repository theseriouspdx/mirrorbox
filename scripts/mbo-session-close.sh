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

# --- existing backup logic below ---
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$ROOT_DIR/data/mirrorbox.db"
BACKUP_DIR="$ROOT_DIR/data/backups"
NEXT_DEV="$ROOT_DIR/.dev/sessions/NEXT_SESSION.md"
NEXT_DATA="$ROOT_DIR/data/NEXT_SESSION.md"

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: Database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/mirrorbox_${STAMP}.bak"
cp "$DB_PATH" "$BACKUP_FILE"

INTEGRITY_RESULT="$(sqlite3 "$BACKUP_FILE" 'PRAGMA integrity_check;' | tr -d '\r')"
if [[ "$INTEGRITY_RESULT" != "ok" ]]; then
  echo "ERROR: integrity_check failed for $BACKUP_FILE: $INTEGRITY_RESULT" >&2
  exit 1
fi

SHA256="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
BACKUP_BASENAME="$(basename "$BACKUP_FILE")"

append_backup_block() {
  local target="$1"
  if [[ ! -f "$target" ]]; then
    return
  fi

  {
    printf "\n## Backup Integrity\n"
    printf -- "- Backup file: %s\n" "$BACKUP_BASENAME"
    printf -- "- SHA-256: %s\n" "$SHA256"
    printf -- "- PRAGMA integrity_check: %s\n" "$INTEGRITY_RESULT"
  } >> "$target"
}

append_backup_block "$NEXT_DEV"
append_backup_block "$NEXT_DATA"

if [[ ! -f "$NEXT_DEV" && ! -f "$NEXT_DATA" ]]; then
  cat > "$NEXT_DATA" <<EOF
# NEXT_SESSION.md

## Backup Integrity
- Backup file: $BACKUP_BASENAME
- SHA-256: $SHA256
- PRAGMA integrity_check: $INTEGRITY_RESULT
EOF
fi

echo "Backup created: $BACKUP_FILE"
echo "PRAGMA integrity_check: $INTEGRITY_RESULT"
echo "SHA-256: $SHA256"
