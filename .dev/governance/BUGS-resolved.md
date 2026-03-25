# BUGS-resolved.md — Mirror Box Orchestrator
# Archive of resolved, completed, superseded, and fixed bugs.
# Reference only. Do not edit or re-open here — log new bugs in BUGS.md.
# Bug ID rule: `BUG-001`–`BUG-184` are legacy-format archive entries and remain unchanged. Starting with `BUG-185`, archived bug headings preserve dual identification: `BUG-### / v0.LL.NN`.
# Version lane rule: see `.dev/governance/VERSIONING.md` for canonical lane definitions and per-lane sequence reset rules.

---

### BUG-233 / v0.3.48: Numbered task shortcuts (1-5) deleted by prior commit regression | RESOLVED 2026-03-24
- **Location:** `src/tui/App.tsx` — `handleInput`
- **Severity:** P1
- **Resolution:** Restored `if (/^[1-5]$/.test(trimmed))` handler accidentally deleted in commit f5d1731. Typing 1-5 activates corresponding startup task via overlay preflight; no matching task shows error in operator panel.
- **Task:** v0.3.48 | **Commit:** 9e92ba9

### BUG-231 / v0.3.46: No thinking/streaming indicator when LLM is generating | RESOLVED 2026-03-24
- **Location:** `src/tui/components/OperatorPanel.tsx`
- **Severity:** P2
- **Resolution:** Shimmer animation added when `pipelineRunning` is true and output lines are empty. `SHIMMER_COLORS` sweep with 80ms interval; cleanup returns unsubscribe. Disappears when output arrives.
- **Task:** v0.3.46 | **Commit:** 9e92ba9

### BUG-230 / v0.3.45: StatsPanel history entries all same color | RESOLVED 2026-03-24
- **Location:** `src/tui/components/StatsPanel.tsx`
- **Severity:** P2
- **Resolution:** History entries now use `STAGE_COLORS[snapshot.stage]` with `C.white` fallback. Token counts and model names remain dim.
- **Task:** v0.3.45 | **Commit:** 9e92ba9

### BUG-229 / v0.3.44: OperatorPanel uses only 34% of available height | RESOLVED 2026-03-24
- **Location:** `src/tui/components/OperatorPanel.tsx`
- **Severity:** P1
- **Resolution:** `panelRows = Math.max(8, Math.floor(available * 0.34))` → `panelRows = Math.max(8, available)`. `useAvailableRows` guard reduced to 3 for header. Panel now uses all available vertical space.
- **Task:** v0.3.44 | **Commit:** 9e92ba9

### BUG-228 / v0.3.43: SessionSavingsBar text collision in PipelinePanel | RESOLVED 2026-03-24
- **Location:** `src/tui/components/PipelinePanel.tsx`
- **Severity:** P2
- **Resolution:** Compact single-line savings bar with `fmtTokens()` for abbreviated counts. Model name truncated to fit. No collisions at narrow widths.
- **Task:** v0.3.43 | **Commit:** 9e92ba9

### BUG-227 / v0.3.42: PipelinePanel redundant stage boxes consume all vertical space | RESOLVED 2026-03-24
- **Location:** `src/tui/components/PipelinePanel.tsx`
- **Severity:** P1
- **Resolution:** Removed all 11 redundant stage bordered boxes. Stage progress remains in StatsPanel only. Added `wordWrap()` helper for word-boundary line wrapping using terminal column count. Pipeline output content now has full vertical space.
- **Task:** v0.3.42 | **Commit:** 9e92ba9

### BUG-226 / v0.3.41: StatusBar header jumbled at 100 cols | RESOLVED 2026-03-24
- **Location:** `src/tui/components/StatusBar.tsx`
- **Severity:** P1
- **Resolution:** Replaced hardcoded truncation widths with dynamic per-item widths derived from `useStdout()` terminal column count each render. `wrap="truncate-end"` on all text elements.
- **Task:** v0.3.41 | **Commit:** 9e92ba9

### BUG-225 / v0.3.40: TabBar hints wrapping and overlapping | RESOLVED 2026-03-24
- **Location:** `src/tui/components/TabBar.tsx`
- **Severity:** P1
- **Resolution:** Hints use `wrap="truncate-end"` with fixed-height `overflow="hidden"` container. No wrapping or overlap at narrow widths.
- **Task:** v0.3.40 | **Commit:** 9e92ba9

### BUG-224 / v0.3.39: StatsPanel does not fill vertical space | RESOLVED 2026-03-24
- **Location:** `src/tui/components/StatsPanel.tsx`
- **Severity:** P1
- **Resolution:** `flexGrow={1}` applied correctly to outer StatsPanel container. Border matches operator panel height at all terminal sizes.
- **Task:** v0.3.39 | **Commit:** 9e92ba9

### BUG-222 / v0.3.37: TUI layout 65/35 split wastes space — right panel too wide, no minimum size check | RESOLVED 2026-03-24
- **Location:** `src/tui/App.tsx`
- **Severity:** P1
- **Resolution:** Changed right stats panel from `width="35%"` to fixed width (30 chars, capped at 30% of terminal). Left panel uses `flexGrow={1}`. Added minimum terminal size check (100×30) with warning message. Stats panel hides entirely below 100 columns.
- **Task:** v0.3.37

### BUG-221 / v0.11.194: Task activation prompts hit "clarification needed: file path" — classifier bypass missing | RESOLVED 2026-03-24
- **Location:** `src/auth/operator.js`, `src/tui/App.tsx`
- **Severity:** P0
- **Resolution:** Added pre-classifier detection of `Activate task vX.Y.Z.` prompts in `processMessage()`. These governance-sourced prompts bypass `classifyRequest()` entirely and return a synthetic classification with proposed files extracted from the prompt. Also added numbered task shortcuts (1-5) to the startup listing with BUG-### display for bug-type tasks.
- **Task:** v0.11.194, v0.3.36

### BUG-219 / v0.3.34: StatsPanel right-side column truncated stage labels and bled text across lines | RESOLVED 2026-03-24
- **Location:** `src/tui/components/StatsPanel.tsx`
- **Severity:** P1
- **Resolution:** Added SHORT_LABELS map with compact stage names, applied `wrap="truncate-end"` to all text elements, shortened section headers ("Model", "Session", "History" instead of verbose forms).
- **Task:** v0.3.34

### BUG-214 / v0.3.31: Main TUI operator panel duplicated pipeline stage chips | RESOLVED 2026-03-24
- **Location:** `src/tui/components/OperatorPanel.tsx`
- **Severity:** P2
- **Resolution:** Removed the `stageHistory` chip row from OperatorPanel. Stage tracking belongs exclusively to the PipelinePanel and StatsPanel.
- **Task:** v0.3.31

### BUG-213 / v0.3.30: Task activation preflight did not show assumptions before asking for corrections | RESOLVED 2026-03-24
- **Location:** `src/tui/components/TasksOverlay.tsx`
- **Severity:** P1
- **Resolution:** `activationSummaryLines()` now shows assumptions from SPEC/governance and acceptance criteria before asking for corrections. Prompts use plain English ("Review the assumptions above") instead of internal jargon.
- **Task:** v0.3.30

### BUG-210 / v0.11.193: Operator clarification flow did not explain its own prior prompt | RESOLVED 2026-03-24
- **Location:** `src/auth/operator.js`, `src/tui/App.tsx`
- **Severity:** P1
- **Resolution:** Added `run next task` and similar phrases to TUI input handler to activate the top active task directly instead of falling through to classification. Expanded `_handleClarificationFollowup` to recognize more patterns and provide specific, plain-language explanations with concrete examples for each clarification type.
- **Task:** v0.11.193

### BUG-209 / v0.3.28: TUI did not recognize explicit task IDs in direct input | RESOLVED 2026-03-24 (pre-existing fix)
- **Location:** `src/tui/App.tsx`, `src/tui/governance.ts`
- **Severity:** P2
- **Resolution:** `extractTaskId` regex and `findTaskById` already implemented in prior session. Verified working.
- **Task:** v0.3.28

### BUG-208 / v0.3.27: TUI dropped READY rows from 9-column projecttracking tables | RESOLVED 2026-03-24 (pre-existing fix)
- **Location:** `src/tui/governance.ts`
- **Severity:** P1
- **Resolution:** `normalizeTaskColumns` already handles 9→10 column conversion. Bug was resolved by BUG-204 governance selection fix.
- **Task:** v0.3.27

### BUG-217 / v0.2.12: `mbo alpha` did not reinstall the npm package after syncing source files | RESOLVED 2026-03-24
- **Location:** `scripts/alpha-runtime.sh`
- **Severity:** P1
- **Resolution:** Added `npm pack` + `npm install <tarball>` step after rsync in `sync_alpha()`. `npx mbo` now runs the latest controller code after a single `mbo alpha` invocation.
- **Task:** v0.2.12

### BUG-216 / v0.3.33: /tasks overlay did not show BUG-### identifiers for bug-type tasks | RESOLVED 2026-03-24
- **Location:** `src/tui/components/TasksOverlay.tsx`
- **Severity:** P2
- **Resolution:** Added `extractBugNumber()` helper that parses BUG-### from `task.links`. Bug-type rows now display the BUG number instead of the version-lane task ID in the ID column. Tasks are also grouped into BUGS and TASKS sections.
- **Task:** v0.3.33

### BUG-215 / v0.3.32: /tasks overlay row overflow caused sloppy column alignment and orphaned character wrapping | RESOLVED 2026-03-24
- **Location:** `src/tui/components/TasksOverlay.tsx`
- **Severity:** P1
- **Resolution:** Added terminal-width-aware title truncation. Column widths are now constants, available title width is computed from `stdout.columns` minus fixed columns, and titles are truncated with ellipsis. Rows no longer overflow or wrap mid-word.
- **Task:** v0.3.32

### BUG-212 / v0.3.29: Terminal mouse selection did not work because TUI kept mouse-tracking mode enabled | RESOLVED 2026-03-24
- **Location:** `src/tui/index.tsx`, `src/tui/App.tsx`
- **Severity:** P1
- **Resolution:** Removed MouseFilterStream entirely and all SGR mouse tracking escape sequences (`\x1b[?1002h`, `\x1b[?1006h`, etc.) from both index.tsx and App.tsx. TUI now uses plain `process.stdin` for input. Terminal drag-select works natively.
- **Task:** v0.3.29

### BUG-211 / v0.2.11: Alpha mirror testing lacked a single dev-only entrypoint and the package shipped test-only artifacts | RESOLVED 2026-03-24
- **Location:** `bin/mbo.js`, `package.json`, `.npmignore`
- **Severity:** P1
- **Resolution:** Added a controller-repo-only `mbo alpha` subcommand that syncs tracked files into `MBO_Alpha` and launches the mirrored runtime, automatically hides that path when the Alpha helper script is absent from a packaged install, removed the shipped `mboalpha` bin alias, and excluded `tests/` plus Alpha/workflow-audit scripts from the published tarball.
- **Task:** v0.2.11

### BUG-207 / v0.11.192: Governance/public changelog boundary drift | RESOLVED 2026-03-24
- **Location:** `CHANGELOG.md`, `.dev/governance/AGENTS.md`, `.dev/governance/SESSION_AUDIT_PROMPT.md`, `scripts/mbo-workflow-audit.js`, `scripts/generate-run-artifacts.js`, `src/tui/governance.ts`, `src/cli/bug-audit.js`
- **Severity:** P1
- **Resolution:** Restored the boundary so root `CHANGELOG.md` is minimal public release notes only, canonical internal state lives in `projecttracking.md` plus bug ledgers, and current compound version formatting uses `_` separators instead of the prior mixed `+`/`.`/`v` style.
- **Task:** v0.11.192

### BUG-206 / v0.2.10: Bug-audit intents promised codebase examination but produced no deterministic audit artifacts | RESOLVED 2026-03-24
- **Location:** `src/cli/bug-audit.js`, `src/tui/App.tsx`, `scripts/test-bug-audit.js`
- **Severity:** P1
- **Resolution:** Added a deterministic local bug-audit module and routed `/bugs`, `bugs list`, `examine the codebase`, and `examine the codebase and return a result` to it directly. Every run now writes `bugs.md`, `bugsresolved.md`, and `summary.json` under `.mbo/logs/bug-audit-<stamp>/` and reports the artifact paths in the operator panel.
- **Task:** v0.2.10

### BUG-205 / v0.3.26: `/tm` omitted project stats and trapped the operator in the Tokenmiser screen | RESOLVED 2026-03-24
- **Location:** `src/cli/tokenmiser-dashboard.js`, `src/tui/App.tsx`, `src/tui/components/StatsOverlay.tsx`, `src/tui/components/StatsPanel.tsx`
- **Severity:** P1
- **Resolution:** `/tm` now opens a closable Tokenmiser overlay that shows session totals, project totals, and by-model breakdowns. `/token` remains an alias, and the operator can return to the main screen with `Esc`, `/tm`, or `SHIFT+T`.
- **Task:** v0.3.26

### BUG-204 / v0.11.191: Startup used the wrong governance ledger and inherited prior-session token totals | RESOLVED 2026-03-24
- **Location:** `src/tui/governance.ts`, `src/tui/App.tsx`, `src/tui/index.tsx`, `src/index.js`
- **Severity:** P1
- **Resolution:** Startup now prefers the canonical governance ledger instead of the bootstrap stub, surfaces `Next Task` plus real outstanding tasks from that ledger, and resets session-scoped Tokenmiser counters at launch so fresh sessions start at zero.
- **Task:** v0.11.191

### BUG-202 / v0.3.25: Runtime `0.3` lane task numbering resets to `v0.3.1` instead of using the next available suffix | RESOLVED 2026-03-24
- **Location:** `src/tui/governance.ts`
- **Severity:** P1
- **Resolution:** New `0.3` lane task ids now advance from the highest consumed suffix in governance, while honoring an unconsumed `Next Task` header when present.
- **Task:** v0.3.25

### BUG-201 / v0.3.24: Runtime task creation must not pre-assign work to a specific agent | RESOLVED 2026-03-24
- **Location:** `src/tui/components/TasksOverlay.tsx`, `src/tui/governance.ts`
- **Severity:** P2
- **Resolution:** Runtime-created tasks now default to `unassigned`, and the task-creation path no longer persists a legacy owner automatically.
- **Task:** v0.3.24

### BUG-200 / v0.2.09: Tokenmiser counterfactual baseline understates naive-workflow cost | RESOLVED 2026-03-23
- **Location:** `src/state/db-manager.js`, `src/cli/tokenmiser-dashboard.js`, `src/tui/components/StatsOverlay.tsx`
- **Severity:** P1
- **Resolution:** Counterfactual cost is now derived from tracked raw-token estimates rather than actual optimized token usage, so Tokenmiser savings reflect the naive baseline honestly.
- **Task:** v0.2.09

### BUG-199 / v0.2.08: Output-Contract hardening: log interleaving and entropy-score mismatch | RESOLVED 2026-03-23
- **Location:** workflow-audit/output parsing surfaces
- **Severity:** P1
- **Resolution:** Planner transcript output is serialized cleanly, entropy reporting no longer diverges from the raw audit signal, and status-label bleed is stripped before assumption parsing.
- **Task:** v0.2.08

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

### BUG-195 / v0.11.188: Assumption ledger sign-off can be bypassed for Tier 0 and read-only workflows | RESOLVED 2026-03-23
- **Location:** `src/auth/operator.js` — `processMessage()` / classification normalization / Stage 1.5 gate entry
- **Severity:** P1
- **Resolution:** Normalized readiness-check requests into an explicit read-only workflow classification, removed the direct read-only bypass, and routed every execution workflow through Stage 1.5 before planning. Added targeted test coverage proving Tier 0 and read-only workflows now emit the spec-refinement gate and require `go`.
- **Task:** v0.11.188

### BUG-197 / v0.2.07: Workflow audit runner claimed live mirror Alpha coverage but only checked stale transcript presence | RESOLVED 2026-03-23
- **Location:** `scripts/mbo-workflow-audit.js`
- **Severity:** P1
- **Resolution:** `--world mirror --push-alpha` now includes the Alpha install/onboarding/E2E checks instead of filtering them out, transcript validation now requires the latest Alpha run to contain the workflow prompt, audit gate, approval acknowledgement, and final idle state, mirrored transcript validation compares the exact latest Alpha log copy, and governance status parsing now recognizes rows from both Active Tasks and Recently Completed.
- **Task:** v0.2.07

### BUG-198 / v0.11.189: Read-only readiness-check workflow crashes in planning recovery with `Cannot read properties of null (reading 'verdict')` | RESOLVED 2026-03-23
- **Location:** `src/auth/operator.js`, `scripts/alpha-e2e-driver.js`, `scripts/alpha-runtime.sh`, `scripts/mbo-workflow-audit.js`
- **Severity:** P1
- **Resolution:** Hardened read-only plan/audit parsing in `operator.js` so compact DID/tiebreaker outputs with `VERDICT` / `CONFLICT` / `CONSENSUS INTENT` no longer collapse to a null verdict, persisted Stage 1.5 `pin:` / `exclude:` hints into planning, added a separate Gemini Flash curl guidance pass in the Alpha E2E driver, added permanent regression coverage in `scripts/test-readonly-workflow-persistence.js`, and passed live Alpha verification in both mirror and subject worlds. Also fixed the subject-world audit runner to keep mirroring transcripts back into the controller repo by exporting `MBO_CONTROLLER_ROOT` into `scripts/alpha-runtime.sh`.
- **Task:** v0.11.189
