# MBO Authorization System

## Overview

MBO uses a **handshake + sentinel** model to ensure only human-authorized writes reach the source tree. No agent may write to `src/` without a valid session token scoped to a specific path.

Two independent protection layers:

| Layer | File | Checked by |
|-------|------|------------|
| Deny sentinel | `.dev/run/write.deny` | `bin/impl_step.sh` (first check) |
| Session lock | `.journal/session.lock` | `bin/handshake.py --status` |

---

## Handshake Script: `bin/handshake.py`

### Commands

| Command | Who | Effect |
|---------|-----|--------|
| `python3 bin/handshake.py <scope>` | Human only | Grants write access to `src/<scope>`, sets 30-min session, clears `write.deny` |
| `python3 bin/handshake.py --revoke` | Human only | Locks `src/` read-only, clears session, writes `write.deny` |
| `python3 bin/handshake.py --status` | Anyone | Prints active scope + TTL, or `[SESSION] None` |
| `python3 bin/handshake.py --pulse` | Anyone | Merkle integrity check, no side effects |
| `python3 bin/handshake.py --merkle-root [path]` | Anyone | Prints current Merkle root of `src/` |

### `MBO_HUMAN_TOKEN` guard

Grant and revoke require `MBO_HUMAN_TOKEN` to be set. Agents calling without it get:

```
[GATE] DENIED: Grant/revoke requires MBO_HUMAN_TOKEN env var.
```

### Recommended alias

Add to `~/.zshrc`:

```bash
alias mbo='MBO_HUMAN_TOKEN=1 python3 ~/MBO/bin/handshake.py'
```

Usage:

```bash
mbo auth/operator      # grant write scope to src/auth/operator.js
mbo cells/graph        # grant write scope to src/cells/graph/
mbo --status           # check active session
mbo --revoke           # end session, lock src/
mbo --pulse            # integrity check only
```

---

## Scope Resolution

Scope is a path relative to `src/`:

- `auth/operator` → `src/auth/operator.js` or `src/auth/operator/`
- `cells/graph` → `src/cells/graph/`
- `relay` → `src/relay/`

Only files under the granted scope are made writable during the session.

---

## Write Gate: `bin/impl_step.sh`

All agent writes route through `bin/impl_step.sh`:

```bash
bash bin/impl_step.sh <task_id> <file_path> <content_file>
```

1. Checks `write.deny` (exits immediately if present)
2. Calls `handshake.py --status` (exits if no active session)
3. Writes file via `cp`
4. Appends to `.dev/run/impl_progress.json`

Agents must never write `src/` directly — always use `impl_step.sh`.

---

## Session Lifecycle

```
Human: mbo <scope>
  → Merkle integrity check (src/ unchanged since baseline)
  → lock_src(): chmod src/**/* to 444, write write.deny
  → grant scope: chmod target to 644, unlink write.deny
  → write .journal/session.lock (TTL 30 min)

Agent: impl_step.sh <task> <file> <content>
  → check write.deny (fast fail)
  → check session.lock (fail if None or expired)
  → cp content → file
  → record progress