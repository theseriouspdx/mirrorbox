#!/usr/bin/env bash
# Atomic implementation step gate.
# Usage: bash bin/impl_step.sh <task_id> <file_path> <content_file>
# Checks handshake scope, writes file, records progress. Exits non-zero on any failure.
set -euo pipefail

TASK_ID="${1:?task_id required}"
FILE_PATH="${2:?file_path required}"
CONTENT_FILE="${3:?content_file required}"
PROGRESS_FILE=".dev/run/impl_progress.json"
MBO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 0. Check write.deny sentinel (fastest check — set by lock_src on revoke)
if [ -f "$MBO_ROOT/.dev/run/write.deny" ]; then
  echo "[IMPL] BLOCKED: write.deny sentinel active. Handshake has been revoked. Run: MBO_HUMAN_TOKEN=1 python3 bin/handshake.py <scope>" >&2
  exit 1
fi

# 1. Check handshake is active and scope covers target file
STATUS=$(python3 "$MBO_ROOT/bin/handshake.py" --status 2>&1)
if echo "$STATUS" | grep -q "None"; then
  echo "[IMPL] BLOCKED: No active handshake session. Run: mbo auth <scope>" >&2
  exit 1
fi
echo "[IMPL] Handshake active: $STATUS"

# Validate session scope covers the target file path
# Governance files (.dev/governance/) are always writable — no handshake required
SCOPE=$(echo "$STATUS" | grep -oP '(?<=Active: )[^ ]+' || true)
if [[ "$FILE_PATH" != .dev/governance/* ]]; then
  if [ -n "$SCOPE" ] && [ "$SCOPE" != "." ]; then
    if ! echo "$FILE_PATH" | grep -q "^$SCOPE"; then
      echo "[IMPL] BLOCKED: Session scope '$SCOPE' does not cover target '$FILE_PATH'. Run: mbo auth src" >&2
      exit 1
    fi
  fi
fi

# 2. Write the file
mkdir -p "$(dirname "$MBO_ROOT/$FILE_PATH")"
cp "$CONTENT_FILE" "$MBO_ROOT/$FILE_PATH"
echo "[IMPL] Written: $FILE_PATH"

# 3. Record progress
if [ ! -f "$MBO_ROOT/$PROGRESS_FILE" ]; then
  echo '{"task_id":"","steps":[]}' > "$MBO_ROOT/$PROGRESS_FILE"
fi
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
python3 - <<PYEOF
import json
path = '$MBO_ROOT/$PROGRESS_FILE'
p = json.load(open(path))
p['task_id'] = '$TASK_ID'
p['steps'].append({'file': '$FILE_PATH', 'ts': '$TIMESTAMP', 'status': 'written'})
json.dump(p, open(path, 'w'), indent=2)
print('[IMPL] Progress recorded: $FILE_PATH')
PYEOF
