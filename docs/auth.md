# MBO Authorization System

## Overview

MBO uses a **handshake + sentinel** model to ensure only human-authorized writes reach the source tree. No agent may write to `src/` without a valid session token scoped to a specific path.

Two independent protection layers:

| Layer | File | Checked by |
|-------|------|------------|
| Deny sentinel | `.dev/run/write.deny` | `bin/impl_step.sh` (first check) |
| Session lock | `.journal/session.lock` | `bin/handshake.py --status` |

---

## Primary Command (`mbo auth`)

Use `mbo auth` as the single user-facing auth command:

```bash
mbo auth status
mbo auth <scope>
mbo auth <scope> --force
```

Behavior:
- Prints current session state before auth.
- Attempts auth for requested scope.
- Prints resulting session state.
- If the same scope is already active, running the same command again toggles and revokes that session.

Examples:

```bash
mbo auth src
mbo auth auth/operator
mbo auth . --force
mbo auth status
```

---

## Handshake Script: `bin/handshake.py`

### Commands

| Command | Who | Effect |
|---------|-----|--------|
| `python3 bin/handshake.py <scope>` | Human/interactive | Grants write access to `src/<scope>`, sets 30-min session, clears `write.deny` |
| `python3 bin/handshake.py <scope> --force` | Human/interactive | Forces grant even on Merkle mismatch (with warning + audit event) |
| `python3 bin/handshake.py --revoke` | Human/interactive | Locks `src/` read-only, clears session, writes `write.deny` |
| `python3 bin/handshake.py --status` | Anyone | Prints `Active`, `Expired`, or `None` |
| `python3 bin/handshake.py --pulse` | Anyone | Merkle integrity check, no side effects |
| `python3 bin/handshake.py --merkle-root [path]` | Anyone | Prints current Merkle root of `src/` |

### Session status output

`--status` now uses explicit states:
- `[SESSION] Active: <scope> (Expires in Ns)`
- `[SESSION] Expired: <scope> (Expired Ns ago)`
- `[SESSION] None`

No expired session is reported as active.

---

## Risky Scope (`.`)

Scope `.` maps to full `src` scope and is high risk.

Rules:
- Requires `--force`
- Prompts explicit confirmation in TTY:
  - `Continue? (yes/no):`
- Denies in non-interactive contexts

---

## Scope Resolution

Scope is a path relative to `src/`:

- `auth/operator` → `src/auth/operator.js` or `src/auth/operator/`
- `cells/graph` → `src/cells/graph/`
- `relay` → `src/relay/`
- `.` / `/` / `src` → entire `src/`

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

```text
Human: mbo auth <scope> [--force]
  → prints session status
  → Merkle integrity check
  → optional force-path warning + audit logging
  → lock_src(): chmod src/**/* to 444, write write.deny
  → grant scope: chmod target to 644, unlink write.deny
  → write .journal/session.lock (TTL 30 min)

Human: mbo auth <same-scope> [--force]
  → toggles: revoke active session

Agent: impl_step.sh <task> <file> <content>
  → check write.deny (fast fail)
  → check session.lock (fail if None/Expired)
  → cp content → file
  → record progress
```
