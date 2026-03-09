#!/usr/bin/env bash
set -euo pipefail

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
