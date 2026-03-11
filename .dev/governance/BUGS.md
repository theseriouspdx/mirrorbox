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

### BUG-036: `mcp-server.js` shutdown() does not WAL-checkpoint before exit | Milestone: 0.6 | OPEN
- **Location:** `src/graph/mcp-server.js` — `shutdown()` calls `server.close()` + `process.exit(0)` without running `PRAGMA wal_checkpoint(TRUNCATE)`.
- **Impact:** On SIGTERM/SIGKILL, any unflushed WAL data is not checkpointed. Next session start checkpoints on launch (existing behaviour), so data is not lost — only the shutdown is not fully clean.
- **Mitigation until fixed:** 5-second SIGTERM grace period in `mbo-session-close.sh --terminate-mcp` allows in-flight ops to complete before the checkpoint-on-startup fallback.

### BUG-009: Graph staleness detection not specified | Milestone: 0.4 | OPEN
### BUG-010: Tiebreaker reviewer block loop undefined | Milestone: 0.7 | OPEN
### BUG-011: HardState truncation priority undefined | Milestone: 0.6 | OPEN
### BUG-012: Smoke test failure loop has no maximum retry count | Milestone: 0.7 | OPEN

### BUG-038: graph_query_impact returns empty callers/callees — cross-file edges not built | Milestone: 0.6 | COMPLETED
- **Location:** `src/graph/static-scanner.js`
- **Severity:** P1
- **Status:** COMPLETED — Static import resolution fallback implemented. Placeholder ID collision fixed. Verified cross-file impact queries.
- **Audit:** PASS (2026-03-09, Gemini CLI)
- **Root cause:** LSP enrichment required a running language server. No JS LSP is configured for dev mode.
- **Fix:** Implemented relative path resolution in `static-scanner.js` to build `IMPORTS` edges without LSP. Fixed placeholder ID collision by making relative IDs unique to source file.
- **Workaround until fixed:** NEXT_SESSION.md must explicitly list the relevant files alongside graph queries so agents don't have to infer them from impact results. (Workaround deprecated)

### BUG-042: `graphSummary` truncation branch unreachable | Milestone: 0.7 | OPEN
- **Location:** `src/auth/operator.js` — `getHardState()` reads `graphSummary` from `this.stateSummary.graphSummary`, which is never populated. Field always falls to 8-word default (~11 tokens). First truncation branch cannot fire in production.
- **Fix:** Wire `stateSummary.graphSummary` to real graph output when graph summary is used (0.7+).

### BUG-043: PID file not written for default agent name | Milestone: 0.6 | OPEN
- **Location:** `scripts/mbo-start.sh:24` — `if [[ "$AGENT" != "operator" ]]` skips PID write when no `--agent` flag is passed (default is `"operator"`).
- **Impact:** `mbo-session-close.sh --terminate-mcp --agent=operator` exits 0 silently, leaving MCP process running.
- **Workaround:** Always pass `--agent=claude` or `--agent=gemini` explicitly.

### BUG-037: MCP lifecycle owned by CLI client configs, not orchestrator | Milestone: 0.9 | OPEN
- **Location:** `.mcp.json` (Claude), `.gemini/settings.json` (Gemini)
- **Impact:** MCP auto-start only works in CLI environments. VS Code extension and hosted web app have no equivalent mechanism.
- **Correct fix:** Wire `mbo-start.sh` as the `startCommand` for the `mbo-graph` dependency in `gate0.config.json` so the orchestrator owns the lifecycle regardless of surface.
- **Current workaround:** CLI-specific auto-start configs are sufficient for Phase 1. Do not rely on them past Milestone 0.9.

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

---

*Last updated: 2026-03-10*
