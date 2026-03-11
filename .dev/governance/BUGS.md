# BUGS.md
## Mirror Box Orchestrator — Known Issues and Queued Fixes

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred with note. Spec gap → spec updated before fix is written.

---

## Section 1 — P0: Blocking Current Milestone (0.6)

(None. Milestone 0.5 SUCCESS. Pre-0.6 Audit PASS.)

---

## Section 2 — P1: Must Fix Before Milestone Complete

### BUG-032: PRE-0.6 Test 1 FAIL — Graph Coordinate Integrity blocked by nodes schema drift
- **Location:** `src/state/db-manager.js`
- **Severity:** P1
- **Status:** COMPLETED — Idempotent migration implemented. Verified in re-audit.

### BUG-033: PRE-0.6 Test 3 FAIL — callModel does not persist redacted prompt/response to Event Store
- **Location:** `src/auth/call-model.js`
- **Severity:** P1
- **Status:** COMPLETED — Event store logging with redaction implemented. Verified in re-audit.

### BUG-034: PRE-0.6 Test 4 FAIL — session-close backup script missing
- **Location:** `scripts/mbo-session-close.sh`
- **Severity:** P1
- **Status:** COMPLETED — Backup script implemented and verified.

### BUG-035: Test 2 heuristic miss on injected phrasing variant
- **Location:** `src/auth/call-model.js`
- **Severity:** P0
- **Status:** COMPLETED — Heuristic strengthened and verified in re-audit.

### BUG-039: Missing mandatory human approval gate before mutation (Inv. 3) | Milestone: 0.7 | COMPLETED
- **Location:** `src/index.js`, `src/auth/operator.js`
- **Severity:** Critical
- **Status:** COMPLETED — Implemented `handleApproval` state machine and `APPROVAL` event logging in `operator.js`.
- **Impact:** Section 2 / Invariant 3 requires explicit `go` at Stage 5; verified enforcement for Tier 1+ routing.

### BUG-040: No `world_id` enforcement for operations (Inv. 10) | Milestone: 0.8 | COMPLETED
- **Location:** `src/state/event-store.js`, `src/state/state-manager.js`
- **Severity:** High
- **Status:** COMPLETED — world_id (mirror/subject) enforced in EventStore and StateManager. Verified in audit.

### BUG-041: No pre-mutation checkpoint mechanism (Inv. 13) | Milestone: 0.8 | COMPLETED
- **Location:** `src/state/state-manager.js`, `src/state/db-manager.js`
- **Severity:** High
- **Status:** COMPLETED — Snapshot-based checkpointing and rollback implemented in StateManager.

### BUG-013: CLI sandbox interaction undefined for terminal context | Milestone: 0.8 | FIXED
- **Location:** `src/index.js`, `src/auth/operator.js`
- **Severity:** Medium
- **Status:** FIXED — Implemented `ctrl+f` focus toggle in `index.js` and input interception in `operator.js`.
- **Impact:** User can interact with dry-run applications in terminal by focusing the sandbox.

### BUG-045: No token usage logging per callModel invocation | Milestone: 0.8 | COMPLETED
- **Location:** `src/auth/call-model.js`, `src/state/db-manager.js`
- **Severity:** Medium
- **Status:** COMPLETED — token_log table, usage capture, and get_token_usage MCP tool implemented.

---

## Section 4 — P2: Deferred

### BUG-044: MCP server stuck state not detected by supervisor | Milestone: 0.7.x | COMPLETED
- Location: `scripts/mbo-watchdog.sh`, `scripts/mbo-start.sh`
- Severity: P1
- Status: COMPLETED — Section 18 Watchdog implemented. Monitors for high CPU/hung processes and SIGKILLs on violation. launchd/parent handles respawn.

### BUG-036: `mcp-server.js` shutdown() does not WAL-checkpoint before exit | Milestone: 0.6 | FIXED
- **Location:** `src/graph/mcp-server.js`
- **Status:** FIXED — Implemented `GraphService.shutdown()` and PRAGMA wal_checkpoint.

### BUG-009: Staleness Detection (Merkle Pulse Check) | Milestone: 1.0 | COMPLETED
- **Location:** `bin/handshake.py`
- **Severity:** High
- **Status:** COMPLETED — Implemented Merkle Pulse Check and audit logging.

### BUG-037: MCP lifecycle owned by CLI client configs | Milestone: 1.0 | COMPLETED
- **Location:** `bin/mbo_server.py`, `src/graph/mcp-server.js`
- **Severity:** Medium
- **Status:** COMPLETED — Decoupled MCP server via independent Python host.

### Milestone 0.3
- **BUG-023:** Fixed redactor callback offset/group1 confusion in `redactor.js`.
- **BUG-024:** Upgraded chain-linked hash envelope with `seq` field.
- **BUG-025:** Fixed deterministic ordering via transaction-assigned `seq`.
- **BUG-026:** Added snapshot type guard to `recover()`.

### BUG-046: stdio transport incompatible with launchd — infinite restart loop | Milestone: 0.8 | FIXED
- **Location:** `src/graph/mcp-server.js`, `.mcp.json`, `.gemini/settings.json`, `scripts/mbo-start.sh`
- **Severity:** P0 (blocked all MCP sessions from persisting)
- **Status:** FIXED — Migrated from `StdioServerTransport` to `StreamableHTTPServerTransport` on port 3737. Each AI client now connects via URL (`http://127.0.0.1:3737/mcp`). Server is persistent under launchd; watchdog spawn removed from `mbo-start.sh`.
- **Root cause:** `StdioServerTransport` is per-connection — the MCP process exited when the client disconnected, triggering launchd respawn. Every new agent session spawned a fresh process, ran a full graph scan+enrich, and then died. The loop was structural, not a crash.
- **Fix details:** `GraphService` singleton owns all graph state. Per-session `Server` + `StreamableHTTPServerTransport` pairs are created on each client's `initialize` handshake and stored in a `sessions` Map. `enqueueWrite()` Promise chain serializes concurrent graph mutations. `isScanning` mutex with `finally` prevents overlapping rescans. `mbo-start.sh` adds port pre-flight kill (SIGTERM → SIGKILL) before starting.

### BUG-047: Session start logging lacks timestamps | Milestone: 0.8 | FIXED
- **Location:** `scripts/mbo-start.sh`, `src/graph/mcp-server.js`
- **Severity:** P2
- **Status:** FIXED — All `echo` lines in `mbo-start.sh` and all `console.error` diagnostics in `mcp-server.js` now include ISO 8601 UTC timestamps via `$(date -u +"%Y-%m-%dT%H:%M:%SZ")` (bash) and `new Date().toISOString()` (Node.js).

### BUG-048: NEXT_SESSION.md generation uses LAST_TASK_NAME in graph_search instead of NEXT_TASK_DESC | Milestone: 0.8 | FIXED
- **Location:** `scripts/mbo-session-close.sh` line ~110
- **Severity:** P1 (caused context drift — next session's Gate 0 search used the completed task name, e.g. "0.6-04", returning empty results)
- **Status:** FIXED — Changed `graph_search("${LAST_TASK_NAME}")` to `graph_search("${NEXT_TASK_DESC}")`. `NEXT_TASK_DESC` is already parsed from `projecttracking.md` earlier in the script and contains a meaningful description like "Implement Runtime Edge enrichment for Intelligence Graph", producing actionable graph query results at session start.

### BUG-049: MCP server exits silently when launched via mbo-start.sh in non-launchd context | Milestone: 1.0 | OPEN
- **Location:** `scripts/mbo-start.sh`, `src/graph/mcp-server.js`
- **Severity:** P1 (blocks graph-dependent session starts; MCP unavailable until manually restarted)
- **Status:** OPEN
- **Symptoms:** `mbo-start.sh --mode=dev` background process exits silently after launch. Port 3737 shows DOWN a few seconds later. No `[MCP]` lines from node appear in output, suggesting node either never starts or its stderr is not reaching the log.
- **Root cause:** `exec node` in the script is CORRECT and must stay. Previous session confirmed: without `exec`, bash spawns node as a child and the watchdog monitors bash's PID (from the PID file). Watchdog hits its timeout, kills bash, node dies with it. Removing `exec` is a known-bad fix — do not re-attempt.
- **Suspected actual cause:** `exec 1>&3` on line 78 fails silently when fd 3 is not valid in the calling context (e.g. bash tool sandbox). With `set -uo pipefail`, this may cause a fatal exit before `exec node` is reached. No `[MCP]` output from node confirms exit happens before node starts.
- **Workaround:** Launch directly: `node src/graph/mcp-server.js --mode=dev &`
- **Next investigation:** Test whether removing the `exec 1>&3` / `exec 3>&1` fd dance (since mcp-server.js only uses stderr) resolves the silent exit without breaking watchdog PID tracking.

---

*Last updated: 2026-03-11*
