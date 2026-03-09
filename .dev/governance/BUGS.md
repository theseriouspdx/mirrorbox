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

### BUG-039: Missing mandatory human approval gate before mutation (Inv. 3) | Milestone: 0.7 | OPEN
- **Location:** `src/index.js`, `src/auth/operator.js`
- **Severity:** Critical (Deferred to 0.7)
- **Impact:** Section 2 / Invariant 3 requires explicit `go` at Stage 5; current flow processes messages directly.
- **Note:** Required for 0.7 execution pipeline, out-of-scope for 0.6 classification/routing.

### BUG-040: No `world_id` enforcement for operations (Inv. 10) | Milestone: 0.8 | OPEN
- **Location:** `src/state/event-store.js`, `src/state/state-manager.js`
- **Severity:** High (Deferred to 0.8)
- **Impact:** Violates Two-World isolation.
- **Note:** Must be enforced before cross-world operations begin in Milestone 0.8.

### BUG-041: No pre-mutation checkpoint mechanism (Inv. 13) | Milestone: 0.8 | OPEN
- **Location:** `src/state/state-manager.js`, `src/state/event-store.js`
- **Severity:** High (Deferred to 0.8)
- **Impact:** Violates deterministic rollback/replay guarantees.
- **Note:** Needs SPEC clarification on whether log writes themselves require checkpoints.

---

## Section 4 — P2: Deferred

### BUG-044: MCP server stuck state not detected by supervisor | Milestone: 0.7.x | OPEN
- **Location:** `~/Library/LaunchAgents/com.johnserious.mbo-mcp.plist`, `scripts/mbo-start.sh`
- **Severity:** P1 (deferred to 0.8 — resolved by watchdog)
- **Symptom:** When both Claude and Gemini share the MCP server instance and one agent session pegs CPU (e.g. stuck Gemini node process at 97%+), the server process becomes unresponsive. The supervisor considers the process healthy (no non-zero exit) and does not restart. The other agent's session loses graph tools silently. Manual kill + restart required.
- **Root cause 1:** No liveness probe. launchd supervises by process existence, not responsiveness.
- **Root cause 2:** launchd plist `bootstrap`/`bootout` commands fail with I/O error on this system — supervisor is registered but cannot be reloaded via launchctl. Exact cause unknown (SIP interaction, macOS version, bootstrap context). Workaround: kill the node process directly; launchd respawns.
- **Root cause 3:** BUG-036 (no WAL checkpoint on shutdown) means a hard kill leaves WAL unflushed, adding recovery overhead to the next startup.
- **Immediate manual recovery:**
  ```bash
  # Find and kill the stuck node process
  ps aux | grep mcp-server | grep -v grep
  kill <PID>
  # launchd respawns automatically (if loaded), or restart manually:
  cd /Users/johnserious/MBO && bash scripts/mbo-start.sh --mode=dev --agent=<claude|gemini> &
  ```
- **Fix (Milestone 0.8):** Implement `scripts/mbo-watchdog.sh` — a background process that pings the MCP server via `graph_search` every 30 seconds and SIGKILLs it on no response within 5 seconds. launchd handles respawn. Also implement multi-agent PID check in `mbo-session-close.sh` to prevent one agent terminating MCP while another is still active.

### BUG-036: `mcp-server.js` shutdown() does not WAL-checkpoint before exit | Milestone: 0.6 | OPEN
- **Location:** `src/graph/mcp-server.js` — `shutdown()` calls `server.close()` + `process.exit(0)` without running `PRAGMA wal_checkpoint(TRUNCATE)`.
- **Impact:** On SIGTERM/SIGKILL, any unflushed WAL data is not checkpointed. Next session start checkpoints on launch (existing behaviour), so data is not lost — only the shutdown is not fully clean.
- **Mitigation until fixed:** 5-second SIGTERM grace period in `mbo-session-close.sh --terminate-mcp` allows in-flight ops to complete before the checkpoint-on-startup fallback.

### BUG-009: Graph staleness detection not specified | Milestone: 0.4 | OPEN
### BUG-010: Tiebreaker reviewer block loop undefined | Milestone: 0.7 | OPEN
### BUG-011: HardState truncation priority undefined | Milestone: 0.6 | OPEN
### BUG-012: Smoke test failure loop has no maximum retry count | Milestone: 0.7 | OPEN
### BUG-013: CLI sandbox interaction undefined for terminal context | Milestone: 0.8 | OPEN

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

---

*Last updated: 2026-03-09*
