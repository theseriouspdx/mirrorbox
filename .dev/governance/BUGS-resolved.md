# BUGS-resolved.md — Mirror Box Orchestrator
# Archive of resolved, completed, superseded, and fixed bugs.
# Reference only. Do not edit or re-open here — log new bugs in BUGS.md.
# Bug ID rule: `BUG-001`–`BUG-184` are legacy-format archive entries and remain unchanged. Starting with `BUG-185`, archived bug headings preserve dual identification: `BUG-### / vX.Y.ZZ`.
# Version lane rule: `0.11.x` core/hardening/onboarding/runtime, `0.2.x` scripting/audit/automation, `0.3.x` TUI/operator UX, `0.4.x` multithreading/concurrency.

---

---

### BUG-194 / v0.11.187: `mbo mcp start` writes launchd plist with KeepAlive=true causing orphan MCP accumulation | Milestone: 1.1 | COMPLETED
- **Location:** MCP start path (`src/` — launchd plist registration)
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-23
- **Task:** v0.11.187
- **Description:** Each `mbo mcp start` registered a launchd daemon with `KeepAlive: true`. Processes killed manually were instantly respawned. Stale plists accumulated for dead project roots (old worktrees, wrong roots, previous sessions). MCP should be ephemeral — started on demand per session, not supervised by launchd.
- **Fix:** `mbo mcp start` no longer registers a KeepAlive launchd daemon. MCP process lifetime is tied to the `mbo` session that spawned it. Orphan-detection/reap logic provides sufficient supervision.

### BUG-193 / v0.3.22: `mbo` bare command should launch TUI by default | Milestone: 1.1 | COMPLETED
- **Location:** `bin/mbo.js` — subcommand routing logic
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-21
- **Task:** v0.3.22
- **Description:** `mbo` with no subcommand launched the legacy operator loop instead of the TUI.
- **Fix:** Updated `bin/mbo.js`. `mbo` (bare) and `mbo tui` now route to TUI. Legacy operator moved to `mbo cl`. Added descriptive usage message for unknown commands.

### BUG-192 / v0.11.185: Readiness-check workflow verification stalls on file requirement | Milestone: 1.1 | COMPLETED
- **Location:** `src/auth/operator.js` — `processMessage()`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-21
- **Task:** v0.11.185
- **Description:** "Run readiness-check" was misclassified as a write workflow but had no files, causing a clarification loop.
- **Fix:** Added `readOnlyWorkflow` bypass in `operator.js`. Skips assumption ledger and returns `ready_for_planning` directly for read-only tasks.

### BUG-189 / v0.11.183: operator treats governance files as passive context | Milestone: 1.1 | COMPLETED
- **Location:** `src/auth/operator.js`, `src/tui/App.tsx`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-21
- **Task:** v0.11.183
- **Description:** Slash commands like `/onboarding` were missing or non-functional. Governance queries spent excessive tokens.
- **Fix:** Implemented `Operator.runOnboarding()`. Routed governance queries through `graph_search` in the idle path and persisted `sessionHistory`.

### BUG-188 / v0.3.21: TUI top header layout wraps badly at 80 columns | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/components/StatusBar.tsx`, `src/tui/components/TabBar.tsx`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-21
- **Task:** v0.3.21
- **Description:** Header was overcrowded and unstable. Stage/state labels dominated the view.
- **Fix:** Reordered `StatusBar` Row 2 to move stage/tab/timer to the right. Moved `TabBar` instructions to a new row. Added programmatic terminal resize to 80x24 at startup.

### BUG-186 / v0.3.21: mouse text selection clears immediately | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/mouseFilter.ts`, `src/tui/index.tsx`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-21
- **Task:** v0.3.21
- **Description:** Ink's mouse interception cleared terminal selections on release.
- **Fix:** Implemented `MouseFilterStream` to drop non-scroll mouse SGR sequences before they reach Ink. Enables native terminal selection behavior.

### BUG-185 / v0.3.21: macOS dictation input can crash host Terminal | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/mouseFilter.ts`, `src/tui/App.tsx`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-21
- **Task:** v0.3.21
- **Description:** Dictation compositor escape sequences crashed Terminal.app in Ink's raw mode. Accidental exits occurred due to single Ctrl+C.
- **Fix:** `MouseFilterStream` sanitizes stdin. Added double-press `Ctrl+C` confirmation logic in `App.tsx` with 2s timeout.

### BUG-164, 163: Runtime write guard and scope drift | Milestone: 1.1 | COMPLETED
- **Location:** `src/auth/operator.js`, `src/utils/runtime-context.js`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-21
- **Task:** v0.11.163
- **Description:** Target runtimes could potentially write into the controller root.
- **Fix:** Implemented `isWithinPath` security utility. Added write guard to `runStage6` to block unauthorized cross-root writes.

### BUG-184: C.purple renders too dark — Stage labels and borders unreadable | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/colors.ts`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.3.17
- **Description:** `C.purple` was mapped to `blueBright`, which was too dark on many terminals.
- **Fix:** Replaced `blueBright` with a bright hex violet (`#B47FFF`).

### BUG-183: PipelinePanel scroll unverified — Auto-scroll and lock logic | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/components/useScrollableLines.ts`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.3.10
- **Description:** Scroll behavior during live streaming was inconsistent.
- **Fix:** Implemented deterministic `userScrolledRef` state management to ensure auto-scroll resumes only when at the literal bottom.

### BUG-182: SystemPanel MCP section incomplete | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/components/SystemPanel.tsx`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.3.09
- **Description:** Missing uptime and model routing information.
- **Fix:** Added global/local config merging and model routing display with live uptime polling.

### BUG-181: Audit gate flow unverified | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/components/InputBar.tsx`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.3.08
- **Description:** Missing visual indicators for the audit stage.
- **Fix:** Added `[AUDIT]` prefix and color-coded border triggers for `audit_gate`.

### BUG-180: TasksOverlay briefing and navigation | Milestone: 1.1 | COMPLETED
- **Location:** `src/tui/components/TasksOverlay.tsx`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.3.07
- **Description:** Basic list was non-interactive and lacked context.
- **Fix:** Implemented cursor navigation and a briefing view that deep-parses `BUGS.md`.

### BUG-177: Governance compliance false failure for docs/e2e-audit-checklist.md | Milestone: 1.1 | COMPLETED
- **Location:** `scripts/mbo-workflow-audit.js`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.11.180
- **Description:** Checklist reported missing even when present.
- **Fix:** Added self-healing template logic to the audit script.

### BUG-176: Onboarding interview hang | Milestone: 1.1 | COMPLETED
- **Location:** `src/cli/onboarding.js`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.11.176
- **Description:** Interview could hang indefinitely on model latency.
- **Fix:** Wrapped model calls in a 60s `AbortController` timeout with status feedback.

### BUG-175: Package artifact bloat | Milestone: 1.1 | COMPLETED
- **Location:** `.npmignore`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-20
- **Task:** v0.11.175
- **Description:** Missing `.npmignore` in worktree caused massive tarball size.
- **Fix:** Restored and verified `.npmignore` excludes development and runtime archives.

---

### BUG-179: Version drift — `package.json` stale at `0.11.24` while CHANGELOG had advanced to `0.2.01` | Milestone: 1.1 | COMPLETED
- **Location:** `package.json`, `src/tui/components/StatusBar.tsx` (reads `pkg.version` at startup)
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-20 (claude, TUI session)
- **Task:** v0.3.02
- **Description:** `package.json` version was never updated when CHANGELOG was bumped through the v2 auto-run script series. StatusBar displayed `v0.11.24` regardless of actual project state. Per Section 17F, `package.json` must always match the most recent CHANGELOG head.
- **Fix:** Updated `package.json` `"version"` to `0.3.01` (current CHANGELOG head). Established versioning governance (AGENTS.md Section 17) to prevent recurrence.

### BUG-178: Unknown `mbo` subcommand falls through to operator loop instead of erroring | Milestone: 1.1 | COMPLETED
- **Location:** `bin/mbo.js` — final `else` branch (operator spawn)
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-20 (claude, TUI session)
- **Task:** v0.3.01
- **Description:** Any unrecognised argument to `mbo` (e.g. `mbo tur` as a typo of `mbo tui`) fell through the subcommand dispatch chain and silently launched the full MBO operator loop. The user had no indication the command was invalid.
- **Fix:** Added `KNOWN_COMMANDS` guard at the top of the `else` block in `bin/mbo.js`. Unrecognised subcommands now exit immediately with `[MBO] Unknown command: "X"` and the list of valid commands.

### BUG-174: `_computeScanInputSignal` sync fs scan blocks event loop | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js`
- **Severity:** P2
- **Status:** COMPLETED — 2026-03-20 (claude/mcp-server-hardening)
- **Task:** v0.11.174
- **Fix:** Converted `_computeScanInputSignal` and `_summarizeAndPersistScan` to `async` using `fs.promises.stat`/`readdir`. Updated all 5 call sites with `await`.

### BUG-173: `keepAliveTimeout` (30s) exceeds launchd `exit timeout` (5s) | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js` — `shutdown()`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-20 (claude/mcp-server-hardening)
- **Task:** v0.11.173
- **Fix:** Added `httpServer.closeAllConnections()` before `httpServer.close()` in shutdown path. Root cause of BUG-165 dangling symlink persistence.

### BUG-172: `enqueueWrite` permanently poisons write queue after error | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js` — `enqueueWrite()`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-20 (claude/mcp-server-hardening)
- **Task:** v0.11.172
- **Fix:** Detached queue tail from rejection: `const next = _writeQueue.then(fn); _writeQueue = next.catch(log); return next`.

### BUG-171: `execSync` no timeout freezes event loop on hung git | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js` — `graph_rescan_changed`
- **Severity:** P0
- **Status:** COMPLETED — 2026-03-20 (claude/mcp-server-hardening)
- **Task:** v0.11.171
- **Fix:** Added `timeout: 5000` to `execSync('git diff --name-only HEAD')`. Confirmed root cause of 1-hour production freeze.
...
### BUG-187 / v0.2.05: Tokenmiser semantics — user interview + mismatch doc + implementation | RESOLVED 2026-03-23
- **Location:** `src/state/db-manager.js`, `src/cli/tokenmiser-dashboard.js`, `src/tui/components/StatsOverlay.tsx`, `src/tui/components/OperatorPanel.tsx`, `src/tui/components/PipelinePanel.tsx`, `src/tui/App.tsx`, `src/state/stats-manager.js`
- **Severity:** P1
- **Resolution:** Interview completed, mismatch documented in `.dev/governance/tokenmiser-semantics-v0.2.05.md`. Implementation: routing savings now canonical via `db.getCostRollup()` (Option B — counterfactual vs actual, not token compression); `/token` and `/tm` unified to same per-model drill-down via `renderTmCommand()`; per-stage token chips added to OperatorPanel; session routing savings bar added to PipelinePanel; StatsOverlay SESSION section relabeled and sourced from `getCostRollup()`; `statsManager.getRoutingSavings()` added as canonical accessor.
- **Task:** v0.2.05


### BUG-194 / v0.11.187: `mbo mcp start` writes launchd plist with KeepAlive=true causing orphan MCP accumulation | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/setup.js` — `buildPlist()`
- **Severity:** P2
- **Status:** RESOLVED — 2026-03-23
- **Task:** v0.11.187
- **Fix:** Removed `KeepAlive: true` and `ThrottleInterval: 10` from the launchd plist template. `RunAtLoad: true` retained as the one-shot launch trigger on `launchctl load`. MCP is now session-scoped — launchd will not respawn killed/crashed processes. `runTeardown()` unload + plist delete remains the clean shutdown path.

### BUG-196 / v0.3.23: `handleInput` arrow function body closes prematurely | RESOLVED 2026-03-23
- **Location:** `src/tui/App.tsx` — `handleInput` `useCallback` body
- **Severity:** P1
- **Resolution:** Inserted missing `if (auditPending || operator.stateSummary?.pendingAudit) {` outer guard before the audit approved/reject branch. Function body now closes at line 453 (`}, [deps])`). Discovered during e2e sync-and-run session.
- **Task:** v0.3.23
