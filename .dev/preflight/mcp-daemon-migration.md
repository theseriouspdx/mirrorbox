# MCP Daemon Migration — Implementation Prompt
## Task: 1.1-H23 — Migrate MCP to launchd-owned system daemon

**Date:** 2026-03-13
**Approved by:** Human Operator (verbal, this session)
**Tier:** 3 — Architecture change, DID required
**Status:** READY FOR IMPLEMENTATION

---

## Context

After 5+ days of MCP troubleshooting across Claude, Gemini, and Codex, the
human Operator has made a strategic architectural decision: the MCP graph server
will become a launchd-owned system daemon with a fixed port. MBO stops managing
process lifecycle entirely.

**Root cause of all prior failures:** MBO was trying to be its own supervisor
(mbo-start.sh, mbo-watchdog.sh, manifest files, port discovery, sentinel polling,
session ID negotiation). This is the wrong layer. The OS does this better.

**Decision:** launchd owns the daemon. MBO becomes a client.

---

## What the new architecture is

1. `launchd` starts `node src/graph/mcp-server.js` at login, restarts on crash,
   logs to `.dev/logs/mcp-stderr.log`. Fixed port `7337`. Always on.

2. Every client (Claude CLI, Gemini CLI, Codex, Operator) connects to
   `http://127.0.0.1:7337/mcp`. No discovery. No manifest. No negotiation.

3. `mbo setup` installs the plist. `mbo teardown` removes it. One command each.

4. Docker/CI: documented precondition — "start the server before running agents"
   via a thin wrapper (`node src/graph/mcp-server.js &`). Not MBO's problem.

---

## Files to DELETE entirely

- `scripts/mbo-start.sh` — replaced by launchd
- `scripts/mbo-watchdog.sh` — replaced by launchd KeepAlive
- `src/utils/resolve-manifest.js` — no manifest to resolve

---

## Files to MODIFY

### `scripts/com.johnserious.mbo-mcp.plist`
Change `ProgramArguments` to call node directly (not mbo-start.sh).
Add `nvm` node path explicitly. Remove ThrottleInterval (currently 3s — too
aggressive; set to 10s). Node path must be absolute, baked at install time.

```xml
<key>ProgramArguments</key>
<array>
  <string>/Users/johnserious/.nvm/versions/node/v24.11.1/bin/node</string>
  <string>/Users/johnserious/mbo/src/graph/mcp-server.js</string>
  <string>--port=7337</string>
  <string>--mode=dev</string>
</array>
<key>ThrottleInterval</key>
<integer>10</integer>
```

### `src/graph/mcp-server.js`
**Keep:** all graph query logic, SQLite layer, MCP tool handlers, scan logic.
**Remove:** port selection logic, manifest write/read, sentinel file write,
startup lock (O_EXCL), instance_id/epoch lifecycle, checksum logic,
`resolve-manifest.js` imports, dynamic port binding.
**Add:** `GET /health` endpoint returning `{status:"ok", project_root, uptime}`.
**Change:** bind `127.0.0.1:7337` (from `--port` arg with 7337 default).
Port is fixed. No fallback. No dynamic selection.
**Result:** file should shrink from ~1013 lines to ~400 lines.

### `src/auth/operator.js`
**Remove:** all of `startMCP()`, `_initializeMCPWithRetry()`,
`_waitForMCPReady()`, `_assertProjectId()`, `_isPortBound()`, `_sendMCPHttp()`
session ID persistence/restore logic, manifest read/write, circuit breaker,
process spawning, sentinel polling. Also remove `resolve-manifest.js` import.
**Keep:** all Operator pipeline logic (stages 1-11), model routing, approval
gate, event store, everything that is not MCP lifecycle management.
**Change:** Replace all MCP connection setup with a single constant:
`const MCP_URL = 'http://127.0.0.1:7337/mcp'`
On startup: single `GET http://127.0.0.1:7337/health` check. If it fails,
log "Graph server not running. Run: mbo setup && launchctl load ~/Library/LaunchAgents/com.johnserious.mbo-mcp.plist"
and exit. Do not retry. Do not attempt to start. Do not manage.
**Result:** operator.js should shrink from ~1609 lines significantly.

### `src/cli/setup.js`
Add `mbo setup` subcommand that:
1. Writes the plist to `~/Library/LaunchAgents/com.johnserious.mbo-mcp.plist`
   with the correct absolute node path baked in (`which node` at install time)
2. Runs `launchctl load -w ~/Library/LaunchAgents/com.johnserious.mbo-mcp.plist`
3. Waits up to 10s for `GET /health` to return 200
4. Prints success or failure with actionable message

Add `mbo teardown` subcommand that:
1. Runs `launchctl unload -w ~/Library/LaunchAgents/com.johnserious.mbo-mcp.plist`
2. Deletes the plist
3. Prints confirmation

### `.mcp.json` and `.gemini/settings.json`
Both should be updated to hardcode `http://127.0.0.1:7337/mcp`.
No dynamic URL. These are now static config files, not derived caches.

### `docs/mcp.md`
Full rewrite — see separate doc written this session.

---

## Files to ADD

### `scripts/mbo-ci-start.sh` (thin CI/Docker wrapper, ~20 lines)
```bash
#!/usr/bin/env bash
# Thin wrapper for CI/Docker environments where launchd is unavailable.
# Not a supervisor. Starts the server and waits for /health.
# Usage: ./scripts/mbo-ci-start.sh && run-your-agents
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
node "$ROOT/src/graph/mcp-server.js" --port=7337 --mode=runtime &
SERVER_PID=$!
for i in $(seq 1 30); do
  sleep 1
  curl -sf http://127.0.0.1:7337/health >/dev/null 2>&1 && break
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "[FATAL] Graph server exited before /health. Check logs." >&2
    exit 1
  fi
done
curl -sf http://127.0.0.1:7337/health >/dev/null 2>&1 || { echo "[FATAL] /health timeout." >&2; exit 1; }
echo "[MBO] Graph server ready on port 7337."
```

---

## Acceptance criteria (all must pass before task is COMPLETED)

1. `launchctl list | grep mbo` shows the service loaded
2. `curl http://127.0.0.1:7337/health` returns `{"status":"ok",...}`
3. `mbo` starts without spawning any MCP server process of its own
4. Gemini CLI and Claude CLI can call `graph_search` successfully
5. Killing the server with `kill -9` causes launchd to restart it within 15s
6. `mbo setup` completes in <10s from a clean state
7. `mbo teardown` cleanly unloads and removes the plist
8. `scripts/mbo-ci-start.sh` works in a Docker container (no launchd)
9. Two concurrent agent sessions can query the server without interference
10. `mcp-server.js` passes `node --check`

---

## DID Protocol

Agent A and Agent B must derive independently. Do not share diffs.
Human reconciles before any file is written to disk.
This is a Tier 3 change — full DID required.

**Order of implementation after reconciliation:**
1. `src/graph/mcp-server.js` (server surgery first — foundational)
2. Plist update + `mbo setup`/`mbo teardown` in `src/cli/setup.js`
3. `src/auth/operator.js` (strip lifecycle, wire fixed URL)
4. Delete `mbo-start.sh`, `mbo-watchdog.sh`, `resolve-manifest.js`
5. Update `.mcp.json`, `.gemini/settings.json`
6. Acceptance test run

---

## Post-Implementation Cleanup (after all 10 acceptance criteria pass)

Once Task 1.1-H23 is COMPLETED and the human Operator confirms, the following
cleanup steps MUST be executed as a single follow-on task (no DID required —
these are all doc/governance changes, Tier 0):

### 1. AGENTS.md (both copies) — remove MCP override language
In Section 11, remove the "While Task 1.1-H23 is OPEN" caveat paragraph.
Replace with: "MCP is available via `http://127.0.0.1:7337/mcp`. Run
`curl http://127.0.0.1:7337/health` to verify before starting."

### 2. BUGS.md — close BUG-069
Change status from OPEN to COMPLETED with date and summary of what was done.

### 3. projecttracking.md — mark 1.1-H23 COMPLETED
Change status from OPEN to COMPLETED.

### 4. NEXT_SESSION.md — update to next actual task
Remove migration content. Point at next real task in projecttracking.md.

### 5. letsgo.md — if it contains any MCP-disabled language, update it
Check for "MCP-disabled", "legacy workflow", "BUG-068" references and remove.

These five steps are the completion gate for the migration. The migration is
NOT done until the governance docs reflect reality.

---

*Written by: Claude (session 2026-03-13) on behalf of human Operator*
*Do not implement without human "go" and DID reconciliation*
