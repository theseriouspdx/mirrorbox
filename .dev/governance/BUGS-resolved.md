# BUGS-resolved.md — Mirror Box Orchestrator
# Archive of resolved, completed, superseded, and fixed bugs.
# Reference only. Do not edit or re-open here — log new bugs in BUGS.md.
# Bug ID rule: `BUG-001`–`BUG-184` are legacy-format archive entries and remain unchanged. Starting with `BUG-185`, archived bug headings preserve dual identification: `BUG-### / vX.Y.ZZ`.
# Version lane rule: `0.11.x` core/hardening/onboarding/runtime, `0.2.x` scripting/audit/automation, `0.3.x` TUI/operator UX, `0.4.x` multithreading/concurrency.

---

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