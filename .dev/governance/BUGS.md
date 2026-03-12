# BUGS.md
## Mirror Box Orchestrator — Known Issues and Queued Fixes

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred with note. Spec gap → spec updated before fix is written.

---

## Section 1 — P0: Blocking Current Milestone (0.6)

(None. Milestone 0.5 SUCCESS. Pre-0.6 Audit PASS.)

### BUG-053: Runtime MCP initialize loop fails on Streamable HTTP (`Server already initialized`) | Milestone: 1.1 | COMPLETED
- **Location:** `src/auth/operator.js` (`startMCP`, `_initializeMCPWithRetry`, `_sendMCPHttp`)
- **Severity:** P0
- **Status:** COMPLETED — 2026-03-12
- **Root cause:** Three compounding defects in the MCP session lifecycle:
  1. `mbo-start.sh` exited with code 1 on port-already-bound — every warm restart silently failed to spawn, leaving the Operator with no server to connect to.
  2. `this.mcpSessionId` was a pure instance variable lost on every `Operator` reconstruction. On warm restart the new instance had no session ID, so `tools/list` was rejected, the catch fell through to the `initialize` loop, and the server returned `400 Server already initialized`. The error was swallowed, leaving `mcpSessionId` permanently null for the session.
  3. `_sendMCPHttp` called `JSON.parse(responseBody)` unconditionally. When the server responded with `Content-Type: text/event-stream` (SSE framing), the body was `data: {...}\n\n` — not valid JSON — causing every call to reject with `Invalid MCP JSON response`.
- **Fix implemented:**
  - `mbo-start.sh`: exit 0 (not 1) when port already bound — warm restart is a valid path.
  - `startMCP`: TCP `_isPortBound` probe gates spawn; `_waitForMCPReady` polls sentinel file (`.dev/run/mcp.ready`) then falls back to TCP rather than retry-storming `initialize`.
  - `_sendMCPHttp`: captures `mcp-session-id` from response header and persists it to `.dev/run/mcp.session` on every successful assignment.
  - `startMCP` reuse path: reads `.dev/run/mcp.session` and restores `this.mcpSessionId` before probing, so `tools/list` goes out with the correct header.
  - `_initializeMCPWithRetry`: on `portBusy=true`, probes with `tools/list` instead of `initialize`. If the restored session ID is rejected, evicts the stale file, nulls the ID, and re-initializes cleanly.
  - `_sendMCPHttp`: reads `Content-Type` header; if `text/event-stream`, parses SSE frames and extracts the first `data:` payload before JSON-parsing.
  - `shutdown`: deletes `.dev/run/mcp.session` on clean shutdown to prevent stale ID reuse after server kill.

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

### BUG-049: MCP server exits silently when launched via mbo-start.sh in non-launchd context | Milestone: 1.0 | FIXED
- **Location:** `scripts/mbo-start.sh`
- **Severity:** P1
- **Status:** FIXED — Removed the `exec 3>&1` / `exec 1>&2` / `exec 1>&3` / `exec 3>&-` fd save-restore block. With `set -uo pipefail`, `exec 1>&3` caused a fatal exit when fd 3 was invalid in non-launchd contexts (e.g. bash tool sandbox). Since `mcp-server.js` uses stderr exclusively, stdout ownership is irrelevant and the fd dance was purely vestigial. `exec node` retained. launchd service enabled via `launchctl load -w` — MCP now auto-starts on login.
- **Fixed:** 2026-03-11

### BUG-054: Graph server has no trust contract — clients cannot verify root or freshness | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js`, `src/auth/operator.js`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-12
- **Description:** The graph server exposes no identity or freshness metadata. All clients (Operator, Claude CLI, Gemini CLI) connect and immediately trust query results with no verification that the server is scanning the correct project root or that the graph is current. This produces silent wrong-context failures.
- **Fix (Task 1.1-10):**
  1. Added `graph_server_info` MCP tool returning project_root, project_id, index_revision, last_indexed_at, node_count, is_scanning.
  2. Server root derived from `__dirname` by default — eliminates cwd dependency.
  3. index_revision and last_indexed_at persisted in DB.
  4. Operator asserts project_id on every connect; hard fails on mismatch.
  5. Documented explicit rescan contract.

### BUG-050: Validator failure does not halt pipeline | Milestone: 1.1 | COMPLETED
- **Location:** `src/auth/operator.js` — `runStage6`, `handleApproval`, `runStage3`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-12
- **Description:** `handleApproval` logged `validatorPassed: false` but did not halt.
- **Fix:** Implemented pipeline halt in `handleApproval` on validator failure. Logs are captured into `stateSummary.executorLogs` and injected into `runStage3` for a planning retry (up to 3 recovery attempts). Added `executorLogs` reset in `processMessage` for new tasks.

### BUG-051: DBManager DB path hardcoded to MBO source directory | Milestone: 1.1 | FIXED
- **Fixed:** 2026-03-11 — `path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db')`
- **Location:** `src/state/db-manager.js` line 6
- **Severity:** P1
- **Status:** OPEN
- **Description:** `DEFAULT_DB_PATH = path.join(__dirname, '../../data/mirrorbox.db')` resolves relative to MBO's own source tree. This is wrong for any project MBO is run against — the DB should live in the project's `.mbo/` directory.
- **Fix:** Resolve from `MBO_PROJECT_ROOT` env var with `process.cwd()` fallback: `path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db')`.

### BUG-052: No global `mbo` entrypoint — tool not installable as a CLI | Milestone: 1.1 | FIXED
- **Fixed:** 2026-03-11 — `bin/mbo.js` created, `package.json` bin entries added, `private` removed.
- **Location:** `package.json`, `bin/` (missing)
- **Severity:** P1
- **Status:** OPEN
- **Description:** No `bin` field in `package.json`. No `bin/mbo.js` launcher exists. MBO cannot be installed globally via `npm install -g` and invoked as `mbo` from a project directory.
- **Fix:** Create `bin/mbo.js` thin launcher (delegates to `src/index.js` via tsx). Add `"bin": { "mbo": "bin/mbo.js", "mboalpha": "bin/mbo.js" }` to `package.json`. See Section 28.

---

*Last updated: 2026-03-12*
