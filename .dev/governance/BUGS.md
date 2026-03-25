## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-243
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / v0.LL.NN`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use the canonical lane definitions in `.dev/governance/VERSIONING.md`. The suffix after the second decimal resets within each lane (`v0.13.01`, `v0.13.02`, then separately `v0.14.01`). `v1.x` task lanes are invalid.

---

### BUG-242 / v0.3.57 — After 'go', pipeline sends back to planning instead of executing
**Severity:** P0
**Status:** OPEN
**Found:** 2026-03-24
**Description:** After the user types `go` at the plan approval gate, the pipeline routes back to planning instead of proceeding to execution. This is a regression — the `go` path should call `handleApproval` which triggers Stage 5+ execution. Likely cause: `handleApproval` is either not being reached (see BUG-241 — `go` may be silently consumed again) or the approval logic inside `handleApproval` / `processMessage` is re-entering the planning path instead of advancing state. Check: (1) whether `go` actually reaches `processMessage`, (2) whether `handleApproval` correctly reads the current pipeline state and advances rather than re-plans, (3) whether the `needsApproval` flag is being cleared after `go` is received.
**Acceptance:**
- Typing `go` after plan convergence advances the pipeline to Stage 5 execution.
- Pipeline does not re-enter planning after `go`.
- Stage indicator advances past planning.

### BUG-241 / v0.3.56 — Planning stage silent at approval gate — no 'go' prompt shown (regression)
**Severity:** P0
**Status:** OPEN
**Found:** 2026-03-24
**Description:** After plan convergence the pipeline stops and waits, but the operator panel displays nothing explaining why — no "Plan ready. Type 'go' to execute." message is shown. This is a regression: BUG-236 fixed this in v0.3.52 by having `activateTask` set `_pipelineRunning = false` before returning `needsApproval`. The v0.3.53 commit may have re-broken this via the BUG-231 shimmer change: OperatorPanel now shows "Thinking…" when `pipelineRunning && !hasContent`. If `_pipelineRunning` is still true at the needsApproval gate (BUG-236 fix incomplete or not reached), the shimmer line replaces the 'go' hint. **Important:** `src/auth/operator.js` has uncommitted working-tree changes — run `git diff src/auth/operator.js` first to verify whether the BUG-236 fix is actually present before writing new code. Auth dir is locked (444); run `mbo auth src` before any write.
**Acceptance:**
- After plan convergence, operator panel displays a visible "Plan ready. Type 'go' to execute." (or equivalent) message.
- User is never left staring at a silent panel without knowing what action is expected.

### BUG-240 / v0.3.55 — Session pipeline output not written to log file (regression)
**Severity:** P1
**Status:** OPEN
**Found:** 2026-03-24
**Description:** Pipeline session output is not being persisted to a log file during TUI runs. This was previously fixed but has regressed — the most recent TUI run produced no session log file under `.mbo/logs/`, leaving the user unable to review output after the fact (especially critical since scroll is also broken per BUG-239). The log write path may have been broken by the operator.js working-tree changes or by the db corruption (BUG-238) preventing state commits that trigger log writes.
**Acceptance:**
- Each TUI pipeline run writes a session log to `.mbo/logs/` containing the full pipeline output.
- Log file is accessible and readable after the session ends.
- Scroll breakage (BUG-239) does not block log access.

### BUG-239 / v0.3.54 — Pipeline output not scrollable in PipelinePanel (Tab 2)
**Severity:** P1
**Status:** OPEN
**Found:** 2026-03-24
**Description:** After the v0.3.53 TUI layout fixes (BUG-227 removed redundant stage boxes, BUG-229 adjusted height calculations), the pipeline workflow window (Tab 2 / PipelinePanel) lost scrollability. User cannot scroll up to review prior pipeline output. Likely cause: the scroll state wiring in PipelinePanel was disrupted when the stage-box rendering block was removed — `useInput` scroll handler may no longer have access to the correct scroll state, or `visibleLines` / scroll offset are no longer being updated correctly.
**Acceptance:**
- Up/Down arrow keys scroll pipeline output in Tab 2.
- PageUp/PageDown or j/k also scroll if previously supported.
- All prior pipeline output is accessible by scrolling.

### BUG-238 / v0.11.195 — Pipeline returns raw JSON to operator panel (regression from v0.3.53)
**Severity:** P0
**Status:** OPEN
**Found:** 2026-03-24
**Description:** After the v0.3.53 commit, the pipeline outputs raw JSON into the operator panel instead of formatted stage output. Two likely causes to investigate: (1) `mirrorbox.db` is missing — only `mirrorbox.db.corrupt.1774404364247` exists in `.mbo/` — the state manager may be failing to initialize and the pipeline is returning a raw error object serialized as JSON; (2) a rendering path change in OperatorPanel (BUG-231 shimmer / BUG-229 height) is accidentally stringifying the lines array before display. Investigate db corruption first — if the state manager throws on startup, the operator pipeline catches and serializes the error as JSON and routes it to the output stream unformatted.
**Acceptance:**
- Pipeline output renders as formatted stage text, not raw JSON.
- `mirrorbox.db` initializes cleanly or recovers from corruption on startup.
- No raw error objects appear in the operator panel output.

### BUG-236 / v0.3.51 — Typing 'go' swallowed as hint: _pipelineRunning stays true after needsApproval
**Severity:** P0
**Status:** FIXED (v0.3.52)
**Found:** 2026-03-24
**Description:** `activateTask` sets `_pipelineRunning = true` at line 1939 but never unsets it before returning `{ needsApproval: true }`. The TUI's `handleInput` guard at line 655 checks `operator._pipelineRunning`, treats `go` as a hint, and never routes it to `processMessage`. Fix: (1) `activateTask` sets `_pipelineRunning = false` before returning `needsApproval`, (2) TUI exempts `go` from the pipeline-running guard, (3) `processMessage` re-sets `_pipelineRunning = true` before calling `handleApproval`.
**Acceptance:**
- After plan convergence, TUI displays "Plan ready. Type 'go' to execute."
- Typing `go` reaches `operator.processMessage` and triggers `handleApproval`.

### BUG-237 / v0.3.51 — Pipeline output garbles across terminal width: VERDICT:SIFIER]
**Severity:** P1
**Status:** FIXED (v0.3.52)
**Found:** 2026-03-24
**Description:** PipelinePanel renders LLM output lines with `wrap="wrap"` which breaks mid-word when a line exceeds terminal width, producing garbled output like "VERDICT:SIFIER]" (from "VERDICT:" + "[CLASSIFIER]" wrapping). Fix: word-wrap lines at word boundaries in `entriesToLines` before rendering, using terminal column count.
**Acceptance:**
- Pipeline output wraps at word boundaries, never mid-word.
- No truncation — all content visible by scrolling.

### BUG-203 / v0.12.02 — MBO graph server not registered as MCP connector in Cowork sessions
**Severity:** P2
**Status:** OPEN
**Task:** v0.12.02
**Assigned:** claude
**Found:** 2026-03-23 (observed during BUG-200 session — Claude fell back to raw DC file reads instead of graph queries)
**Description:**
When working on the MBO codebase from a Cowork session, the MBO graph server (`localhost:53935`) is not
registered as an MCP connection. This forces the agent to use Desktop Commander raw file reads (`cat`,
`sed`, `grep`) for context assembly instead of `graph_get_knowledge_pack`, `graph_search`, and
`graph_query_callers` — the exact tools MBO exists to provide. The irony is significant: MBO is being
audited and developed using workflows that bypass its own graph routing, producing higher token cost and
lower-signal context than the indexed graph would supply. The fix is to register the MBO MCP server as
a Cowork connector so Cowork sessions on this project start with the graph server available as a
first-class tool alongside Desktop Commander.
**Partial fix — 2026-03-23:** `.claude/commands/graph.md` added. Running `/graph` at session start verifies server health, reads the dynamic port from `.dev/run/mcp.json`, regenerates `.mcp.json` with the correct port, and patches `settings.local.json` — works across all auth sources (OAuth, API) since the command file is committed. `.mcp.json` stays gitignored by design (port is dynamic per AGENTS.md §11).
**Remaining:** Cowork sessions still cannot use the graph server directly (no MCP registration path in Cowork yet). Full fix requires a Cowork plugin that reads `.dev/run/mcp.json` and auto-registers the server at session start.
**Acceptance:**
- `/graph` command runs cleanly from any Claude Code session regardless of auth source and leaves the graph server available as a first-class MCP tool.
- MBO graph server is registered and available in Cowork sessions for this project (requires Cowork MCP plugin support).
- Agent can call `graph_get_knowledge_pack`, `graph_search`, `graph_query_callers` directly without falling back to raw file reads for context assembly.
- Session startup guidance notes `/graph` as the first command to run.

### BUG-218 / v0.2.13 — `mbo` bare command has no auto-update check before launching the TUI
**Severity:** P2
**Status:** OPEN
**Task:** v0.2.13
**Assigned:** unassigned
**Found:** 2026-03-24
**Description:**
When an end user runs `mbo` on a target project, the CLI launches the TUI immediately using whatever version is currently installed in `node_modules`. There is no version check against the npm registry (or a local source) and no auto-update path. If MBO ships a fix, the user continues running stale code until they manually reinstall. For a self-updating orchestrator, the bare `mbo` command should check for a newer version and update before launching.
**Acceptance:**
- `mbo` checks for a newer published version before launching the TUI.
- If a newer version is available, it updates automatically (or prompts the user).
- The check adds minimal latency (cached/async where possible).
- Offline or registry-unreachable scenarios degrade gracefully to running the installed version.

### BUG-220 / v0.3.35 — First Ctrl+C in TUI double-quit should display "press Ctrl+C again to exit"
**Severity:** P2
**Status:** OPEN
**Task:** v0.3.35
**Assigned:** unassigned
**Found:** 2026-03-24
**Description:**
The TUI uses a double Ctrl+C confirmation pattern for exit. On the first press the TUI should display
a visible message such as "Press Ctrl+C again to exit" so the user knows to press again. Currently
the first press has no visible feedback, making the double-quit pattern opaque.
**Acceptance:**
- First Ctrl+C press displays a visible "press Ctrl+C again to exit" message in the TUI.
- Second Ctrl+C within a short window exits cleanly.
- If no second press arrives within ~2 seconds, the message clears and the TUI returns to normal.

### BUG-224 / v0.3.39 — StatsPanel does not fill vertical space
**Severity:** P1
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** StatsPanel right column doesn't stretch to match the operator panel height. Prior `height="100%"` removal + `flexGrow={1}` fix was not verified.
**Acceptance:**
- Stats/pipeline panel border extends to the same height as the operator panel at all terminal sizes.
- No dead space below the stats panel.

### BUG-225 / v0.3.40 — TabBar hints wrapping and overlapping with content below
**Severity:** P1
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** Tab bar hint text still wraps/overlaps with content below it. `wrap="truncate-end"` alone doesn't fix the layout collision.
**Acceptance:**
- Hint text truncates cleanly instead of wrapping at narrow terminal widths.
- No overlap with content below the tab bar.

### BUG-226 / v0.3.41 — StatusBar header jumbled at 100 cols
**Severity:** P1
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** StatusBar two-row layout uses `justifyContent="space-between"` with hardcoded truncation widths (36, 34 chars). At 100 cols, the three items per row don't fit and collide/overlap. StatusBar needs terminal-width-aware truncation and `wrap="truncate-end"` on text elements.
**Acceptance:**
- StatusBar renders cleanly at 100×36 and 120×40 without text overlap.
- Action text and task name truncate gracefully based on available width.

### BUG-227 / v0.3.42 — PipelinePanel redundant stage boxes consume all vertical space
**Severity:** P1
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** PipelinePanel (Tab 2) renders all 11 pipeline stages as bordered boxes with `flexWrap="wrap"` (lines 126-141). These duplicate the StatsPanel's pipeline list on the right and consume massive vertical space, leaving no room for the actual pipeline output content.
**Acceptance:**
- PipelinePanel shows pipeline output content with maximum vertical space.
- Stage progress is shown only in the right StatsPanel, not duplicated.

### BUG-228 / v0.3.43 — SessionSavingsBar text collision in PipelinePanel
**Severity:** P2
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** `SessionSavingsBar` in PipelinePanel renders 4+ items in a row with `gap={2}` and no truncation. At available width (~70 chars), items collide.
**Acceptance:**
- Savings bar text fits on one line with truncation at narrow widths.
- Model name truncated to fit available space.

### BUG-229 / v0.3.44 — OperatorPanel scrollable area uses only 34% of available height
**Severity:** P1
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** `OperatorPanel.tsx` line 95: `panelRows = Math.max(8, Math.floor(available * 0.34))`. The operator panel is the primary content area when Tab 1 is active — it should use all available vertical space, not 34%. This causes classifier output to be cut off and unreadable.
**Acceptance:**
- Operator panel uses all available vertical space when Tab 1 is active.
- Classifier output, rationale, and all text fully visible or scrollable.

### BUG-230 / v0.3.45 — StatsPanel history entries all same color
**Severity:** P2
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** StatsPanel history section renders all entries with `C.white dimColor`. Stage names in history should use their stage-specific colors from `STAGE_COLORS` for visual differentiation.
**Acceptance:**
- Each history entry's stage name renders in its stage-specific color.
- Token counts and model names remain secondary/dim.

### BUG-231 / v0.3.46 — No thinking/streaming indicator when LLM is generating
**Severity:** P2
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** When the pipeline is running and waiting for LLM output, there's only a three-dot pulse on the OperatorPanel status line. There's no visible "thinking" or streaming text indicator in the main content area. The user can't tell if the system is working.
**Acceptance:**
- Visible animated indicator in the content area when waiting for LLM response.
- Indicator disappears when output arrives.

### BUG-232 / v0.3.47 — SPEC Section 2 missing core UX principles (conversational input, application containment)
**Severity:** P0
**Status:** RESOLVED (v0.3.47)
**Found:** 2026-03-24
**Fix:** Added Principles 7 and 8 to SPEC Section 2.
**Acceptance:**
- SPEC Section 2 contains principles for conversational input and application containment.

### BUG-233 / v0.3.48 — Numbered task shortcuts (1-5) deleted by prior commit regression
**Severity:** P1
**Status:** FIXED (v0.3.53 / commit 9e92ba9)
**Found:** 2026-03-24
**Description:** Commit f5d1731 accidentally deleted the `if (/^[1-5]$/.test(trimmed))` handler from handleInput that was added in commit 2a102f9. Restored in working tree but uncommitted.
**Acceptance:**
- Typing 1-5 in input bar activates corresponding startup task via overlay preflight.
- Typing a number with no matching task shows error in operator panel.

### BUG-234 / v0.13.02 — task-reader.js CJS/ESM mismatch: TASK_NOT_FOUND for all tasks
**Severity:** P0
**Status:** FIXED (v0.3.51)
**Found:** 2026-03-24
**Description:** `src/utils/task-reader.js` (CJS) calls `require('src/tui/governance.js')` but the file is `governance.ts` (ESM via tsx). The `.js` file never existed. Every `operator.activateTask()` call hits `TASK_NOT_FOUND` because the require silently fails and returns `{ task: null }`. Fix: rewrote task-reader.js with inline markdown parser — zero dependency on TUI build.
**Acceptance:**
- `findTaskById(root, 'v0.13.02')` returns the correct TaskRecord from projecttracking.md.
- All 33 active tasks resolve correctly.

### BUG-235 / v0.14.02 — checkpoint world_id passed as object instead of string
**Severity:** P0
**Status:** FIXED (v0.3.51)
**Found:** 2026-03-24
**Description:** `operator.js:1922` called `stateManager.checkpoint(this.stateSummary)` where `this.stateSummary` is the full state object. `checkpoint()` expects `'mirror'` or `'subject'`. Every successful task lookup then crashed with `[INVARIANT VIOLATION] Invalid world_id: [object Object]`. Fix: changed to `checkpoint('mirror')` consistent with the three other checkpoint calls in operator.js.
**Acceptance:**
- Task activation does not throw INVARIANT VIOLATION.
- Checkpoint is created with world_id='mirror'.

### BUG-223 / v0.3.38 — InputBar text editing: forward delete does nothing, mid-cursor insert misplaces characters
**Severity:** P1
**Status:** OPEN
**Task:** v0.3.38
**Assigned:** unassigned
**Found:** 2026-03-24
**Description:**
The TUI input bar (using `ink-text-input@6.0.0`) has two editing defects: (1) the Delete key (forward
delete) does nothing — only Backspace works, forcing the user to go to end-of-text to erase; (2) when
moving the cursor to mid-string and typing a character, it inserts at the wrong position (e.g. placing
cursor before `13.02` and typing `.` produces `13..02` instead of `.13.02`). Both are likely limitations
of the `ink-text-input` library. Fix options: patch the library, replace with a custom input component,
or upgrade to a version that handles these cases.
**Acceptance:**
- Forward Delete key removes the character after the cursor.
- Inserting a character at any cursor position places it correctly.
- Arrow keys, Home, End move the cursor without side effects.
