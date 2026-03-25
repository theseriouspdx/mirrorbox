## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-253
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / v0.LL.NN`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use the canonical lane definitions in `.dev/governance/VERSIONING.md`. The suffix after the second decimal resets within each lane (`v0.13.01`, `v0.13.02`, then separately `v0.14.01`). `v1.x` task lanes are invalid.

---

### BUG-252 / v0.11.197 — Pipeline loops back to planning indefinitely after any failure or divergence
**Severity:** P0
**Status:** OPEN
**Task:** v0.11.197
**Found:** 2026-03-25
**Confirmed:** Session log `/MBO_Alpha/.mbo/logs/session-2026-03-25-10-49-51-tui-abfdbf22-d8f.log`
**Description:** Two compounding causes produce an infinite planning loop that the user cannot exit without typing 'stop':

**Cause 1 — Divergent plans drop the plan on 'go':** When `activateTask` calls `runStage3` and planners diverge, `runStage3` returns `{ needsTiebreaker: true }` with no `plan` property. `activateTask` stores `pendingDecision = { plan: undefined }`. When the user types 'go', `handleApproval` finds `existingPlan = undefined` and reruns Stage 3 from scratch. Confirmed in log: VERDICT: divergent at line 107 → user types 'go' → planning immediately restarts at line 124.

**Cause 2 — Auto-recovery after CLI failure reruns planning:** `handleApproval` deletes `pendingDecision` at line 2093 before doing any work. If code derivation fails (e.g., `CLI exited 1` at log line 349), the auto-recovery path at line 2198 calls `this.handleApproval('go')` again. At this point `pendingDecision` is gone, `existingPlan` is undefined, and Stage 3 reruns from scratch — even though plans just converged (CONFLICT: none at lines 265, 475). The user never types 'go' again; the system loops itself. Confirmed in log: convergent plans at line 262 → code derivation → CLI exits 1 → "Attempting recovery (1/3)..." → planning restarts at line 352 → converges again → CLI exits 1 → planning restarts again.

**Root cause:** `pendingDecision` is deleted too early (line 2093, before execution) and never restored on failure. Any retry path — manual 'go' after error, or auto-recovery — starts from zero.

**Fix:** Before deleting `pendingDecision` at line 2093, snapshot `{ agreedPlan, classification, routing, knowledgePack }` into a local recovery context. If code derivation fails and auto-recovery fires at line 2198, pass the snapshotted plan directly to Stage 4 (code derivation) instead of calling `handleApproval('go')` which re-enters Stage 3. Also: `activateTask` must run the tiebreaker inline when `needsTiebreaker` is true, or store the tiebreaker-needed state so `handleApproval` resolves it without full Stage 3 rerun.

**Files:** `src/auth/operator.js` (`handleApproval` ~lines 2087–2198, `activateTask` ~lines 1974–2008) — locked (444), requires `mbo auth src` + `go`.
**Acceptance:**
- Plans that converge do not trigger a Stage 3 rerun on retry/recovery.
- Auto-recovery after code derivation failure retries from Stage 4, not Stage 3.
- The user is not forced to type 'stop' to escape a planning loop.
- Divergent plans on first activation run the tiebreaker, not a full Stage 3 rerun.

### BUG-251 / v0.3.63 — PipelinePanel scroll still not working in v0.3.60 (regression of BUG-244)
**Severity:** P1
**Status:** OPEN
**Task:** v0.3.63
**Found:** 2026-03-25
**Description:** BUG-244 was marked FIXED in v0.3.58 (commit 96bbd4d) by changing `useAvailableRows(4)` to `useAvailableRows(12)` in `PipelinePanel.tsx`. User confirmed scroll is still not working in v0.3.60. Commits v0.3.59 (BUG-245, session log tee removal) and v0.3.60 (BUG-248, conversation layer) touched `src/utils/session-log.js` and `src/tui/App.tsx` but not `PipelinePanel.tsx` directly — regression is not obviously explained by those changes. Possible causes: (1) the `useAvailableRows(12)` fix in commit 96bbd4d was correctly landed but the reserved-rows count is still wrong at certain terminal sizes; (2) the auto-tab-switch (BUG-250) is keeping the user off Tab 2 during planning so scroll is never testable; (3) the `maxTop` calculation has a secondary bug where scroll state resets on every pipeline entry append. Needs fresh investigation at v0.3.60 HEAD.
**Files:** `src/tui/components/PipelinePanel.tsx`, `src/tui/components/useScrollableLines.ts` (or equivalent hook)
**Acceptance:**
- Up/Down arrow keys scroll pipeline output in Tab 2 when content exceeds visible height.
- Scroll indicators appear once content overflows.
- Scroll state is preserved as new pipeline entries append (does not reset to bottom on each chunk).

### BUG-250 / v0.3.62 — Stage polling auto-switches to Tab 2 during planning, hiding Tab 1 'go' prompt
**Severity:** P1
**Status:** OPEN
**Task:** v0.3.62
**Found:** 2026-03-25
**Description:** `App.tsx` line 265–266: when the stage polling loop detects `planning`, `context_pinning`, `tiebreaker_plan`, or `code_derivation`, it calls `setActiveTab(2)` automatically. This switches the user to the Pipeline tab to watch streaming output. However, when planning finishes and `needsApproval` is true (line 357–364 in `startTask`, line 726–732 in `handleInput`), the 'go' prompt is written to the **Operator panel (Tab 1)** without switching back. The user remains on Tab 2, never sees the prompt, and doesn't know to type 'go'. This is the root cause of BUG-241 (no 'go' prompt visible) re-occurring after the v0.3.57 fix — the message is written correctly, but to the wrong tab from the user's perspective. Additionally violates the session design agreed on 2026-03-25: auto-tab-switching should be removed entirely (Principle 9); the Operator tab is the persistent primary view and pipeline activity renders inline rather than forcing a tab switch.
**Files:** `src/tui/App.tsx` (stage polling useEffect lines 256–272, startTask lines 357–364, handleInput lines 726–732)
**Fix:** (1) Immediate: add `setActiveTab(1)` immediately after `setWaitingForApproval(true)` at both callsites (startTask line 364, handleInput line 732) so the system returns to Operator at the approval gate. (2) Full: remove auto-tab-switching from the stage polling loop entirely per Principle 9 (Operator persistent primary view). Tabs remain manually switchable but the system never auto-navigates away from Operator. This is tracked as task v0.3.62.
**Acceptance:**
- After plan convergence, system switches to Tab 1 and the 'go' prompt is visible.
- User is never stranded on Tab 2 awaiting a prompt that is on Tab 1.
- (Full fix) Stage transitions do not auto-switch tabs; user remains on whichever tab they chose.

### BUG-249 / v0.11.196 — wrapHardState serializes as JSON, violating Section 36 plain-English contract
**Severity:** P1
**Status:** OPEN
**Task:** v0.11.196
**Found:** 2026-03-25
**Description:** `wrapHardState()` in `src/auth/call-model.js` (line 200–203) serializes the hard state object using `JSON.stringify(hardState, null, 2)` and injects it as a `<HARD_STATE>` block into every model system prompt. The hard state includes `onboardingProfile` (a nested JSON object), `dangerZones`, and `graphSummary`. This JSON-heavy structure is visible to every model call — classifier, planner, reviewer, tiebreaker, operator — at the top of every system prompt. Despite all user-facing prompts instructing "plain English using these sections," the JSON-primed system context causes models to drift toward JSON-formatted responses, especially on structured classification and planning calls. This directly violates the Section 36 contract (`call-model.js` line 197: "model communication is plain English. JSON may appear only as inert project content or transport payloads, not as a response schema.") and is the root cause of JSON leaking into the pipeline output (operator/pipeline panels) even after BUG-238's display-layer guard was applied. BUG-238 patched the symptom (guarding the final result object); this bug is the source.
**Files:** `src/auth/call-model.js` (`wrapHardState`) — locked (444), requires `mbo auth src` + `go`.
**Fix:** Replace `JSON.stringify(hardState, null, 2)` in `wrapHardState` with a plain-text labeled-section serializer matching the classifier/planner output format. Each top-level field becomes a labeled section (e.g., `PRIME_DIRECTIVE:\n<value>\n\nONBOARDING_PROFILE:\n<key: value lines>\n\nDANGER_ZONES:\n<one per line>`). Nested objects flatten to `key: value` lines. No JSON syntax anywhere in the emitted block.
**Acceptance:**
- `wrapHardState` emits no JSON syntax (`{`, `}`, `"key":`) in its output.
- All model calls receive hard state as labeled plain-text sections.
- Classifier, planner, and reviewer responses stop drifting to JSON format.
- Existing `_safeParseJSON` / `_extractDecision` parsing is unaffected (they parse model *output*, not hard state).

### BUG-242 / v0.3.57 — After 'go', pipeline sends back to planning instead of executing
**Severity:** P0
**Status:** FIXED (v0.3.57 / commit 5ebe268)
**Found:** 2026-03-24
**Description:** After the user types `go` at the plan approval gate, the pipeline routes back to planning instead of proceeding to execution. This is a regression — the `go` path should call `handleApproval` which triggers Stage 5+ execution. Likely cause: `handleApproval` is either not being reached (see BUG-241 — `go` may be silently consumed again) or the approval logic inside `handleApproval` / `processMessage` is re-entering the planning path instead of advancing state. Check: (1) whether `go` actually reaches `processMessage`, (2) whether `handleApproval` correctly reads the current pipeline state and advances rather than re-plans, (3) whether the `needsApproval` flag is being cleared after `go` is received.
**Acceptance:**
- Typing `go` after plan convergence advances the pipeline to Stage 5 execution.
- Pipeline does not re-enter planning after `go`.
- Stage indicator advances past planning.

### BUG-241 / v0.3.56 — Planning stage silent at approval gate — no 'go' prompt shown (regression)
**Severity:** P0
**Status:** FIXED (v0.3.57 / commit 5ebe268)
**Found:** 2026-03-24
**Description:** After plan convergence the pipeline stops and waits, but the operator panel displays nothing explaining why — no "Plan ready. Type 'go' to execute." message is shown. This is a regression: BUG-236 fixed this in v0.3.52 by having `activateTask` set `_pipelineRunning = false` before returning `needsApproval`. The v0.3.53 commit may have re-broken this via the BUG-231 shimmer change: OperatorPanel now shows "Thinking…" when `pipelineRunning && !hasContent`. If `_pipelineRunning` is still true at the needsApproval gate (BUG-236 fix incomplete or not reached), the shimmer line replaces the 'go' hint. **Important:** `src/auth/operator.js` has uncommitted working-tree changes — run `git diff src/auth/operator.js` first to verify whether the BUG-236 fix is actually present before writing new code. Auth dir is locked (444); run `mbo auth src` before any write.
**Acceptance:**
- After plan convergence, operator panel displays a visible "Plan ready. Type 'go' to execute." (or equivalent) message.
- User is never left staring at a silent panel without knowing what action is expected.

### BUG-240 / v0.3.55 — Session pipeline output not written to log file (regression)
**Severity:** P1
**Status:** FIXED (v0.3.57 / commit 5ebe268)
**Found:** 2026-03-24
**Description:** Pipeline session output is not being persisted to a log file during TUI runs. This was previously fixed but has regressed — the most recent TUI run produced no session log file under `.mbo/logs/`, leaving the user unable to review output after the fact (especially critical since scroll is also broken per BUG-239). The log write path may have been broken by the operator.js working-tree changes or by the db corruption (BUG-238) preventing state commits that trigger log writes.
**Acceptance:**
- Each TUI pipeline run writes a session log to `.mbo/logs/` containing the full pipeline output.
- Log file is accessible and readable after the session ends.
- Scroll breakage (BUG-239) does not block log access.

### BUG-244 / v0.3.58 — PipelinePanel scroll reserved rows wrong — maxTop always 0
**Severity:** P1
**Status:** FIXED (v0.3.58 / commit 96bbd4d)
**Found:** 2026-03-25
**Description:** `PipelinePanel.useAvailableRows(4)` only subtracted panel chrome, ignoring StatusBar(2)+TabBar(1)+InputBar(3)+SavingsBar(2). `maxTop` was always 0 so scroll indicators never appeared and arrow keys had no effect. Fixed by changing to `useAvailableRows(12)`.
**Acceptance:**
- Scroll indicators appear once pipeline output exceeds visible height.
- Up/Down arrow keys scroll pipeline output.

### BUG-243 / v0.3.58 — 'stop'/'abort' confirmation shown on wrong tab
**Severity:** P2
**Status:** FIXED (v0.3.58 / commit 96bbd4d)
**Found:** 2026-03-25
**Description:** Stop/abort worked functionally but confirmation message appeared in Operator tab (1) while user was watching Pipeline tab (2). Fixed by adding `setActiveTab(1)` in the stop handler and adding stop/abort to pipeline gate exemptions.
**Acceptance:**
- Typing 'stop' or 'abort' switches to Operator tab and shows confirmation there.

### BUG-239 / v0.3.54 — Pipeline output not scrollable in PipelinePanel (Tab 2)
**Severity:** P1
**Status:** FIXED (v0.3.58 / commit 96bbd4d — resolved as BUG-244)
**Found:** 2026-03-24
**Description:** After the v0.3.53 TUI layout fixes (BUG-227 removed redundant stage boxes, BUG-229 adjusted height calculations), the pipeline workflow window (Tab 2 / PipelinePanel) lost scrollability. User cannot scroll up to review prior pipeline output. Likely cause: the scroll state wiring in PipelinePanel was disrupted when the stage-box rendering block was removed — `useInput` scroll handler may no longer have access to the correct scroll state, or `visibleLines` / scroll offset are no longer being updated correctly.
**Acceptance:**
- Up/Down arrow keys scroll pipeline output in Tab 2.
- PageUp/PageDown or j/k also scroll if previously supported.
- All prior pipeline output is accessible by scrolling.

### BUG-238 / v0.11.195 — Pipeline returns raw JSON to operator panel (regression from v0.3.53)
**Severity:** P0
**Status:** FIXED (v0.3.57 / commit 5ebe268)
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

### BUG-245 / v0.3.59 — Session log filled with ANSI escape codes (60MB files)
**Severity:** P1
**Status:** FIXED (v0.3.59 / 64d4a1f)
**Found:** 2026-03-25
**Description:** `tee('stdout')` in session-log.js patched `process.stdout.write` and captured every Ink render frame, producing 44–60MB log files full of ANSI escape codes. Pipeline output is already captured cleanly via `operator._chunkLogger → writeMeta()`. The stdout tee was redundant.
**Fix:** Removed `tee('stdout')`. Kept `tee('stderr')`. No other changes.
**Acceptance:** Session log is human-readable plain text. Contains all pipeline stage output. No escape codes.

### BUG-246 / v0.3.60 — 'go' after pipeline error re-enters planning from scratch
**Severity:** P1
**Status:** OPEN
**Task:** v0.3.60
**Found:** 2026-03-25
**Description:** After a pipeline error (e.g. code_derivation fails), the TUI shows "[RECOMMENDED ACTION]: type 'go' to retry." Typing 'go' re-enters planning from scratch instead of retrying from the failure point. Root cause: the error recovery path does not set `waitingForApproval`, so the 'go' input falls through to `processMessage` which re-classifies the original task from scratch.
**Files:** `src/tui/App.tsx` (handleApproval, error state), `src/auth/operator.js` (handleApproval)
**Acceptance:** Typing 'go' after a pipeline error retries from the failure stage, not from planning.

### BUG-248 / v0.3.60 — Session log missing conversation layer
**Severity:** P1
**Status:** FIXED (v0.3.60)
**Task:** v0.3.60
**Found:** 2026-03-25
**Description:** After removing `tee('stdout')` in v0.3.59, the session log captured backend pipeline events (via `writeMeta`) and stderr metadata (via `tee('stderr')`) but not the conversation layer. User input typed in the TUI, operator responses shown in the Operator panel, `go`/`stop` commands, and raw JSON blobs were all invisible in the log. Root cause: conversation content is rendered by Ink from React state, not written to stdout/stderr. Additionally, React duplicate-key warnings (`key=""`) from `TasksOverlay.tsx` flooded every log on session start due to array `.map()` calls using text content as keys — empty lines produced `key=""` collisions.
**Files:** `src/utils/session-log.js`, `src/tui/App.tsx`, `src/tui/components/TasksOverlay.tsx`
**Fix:** Added `logEvent(category, message)` direct-write function to `session-log.js` that writes timestamped lines directly to the log file stream, bypassing stdout/stderr entirely. Wired `appendOperator` (all operator panel output) and `handleInput` (all user input) in `App.tsx` to call `getActiveLog()?.logEvent()`. Fixed `key={line}` → `key={i}` in two `.map()` calls in `TasksOverlay.tsx`.
**Acceptance:** Session log shows all user input as `[session TS] [user] <text>` and all operator panel output as `[session TS] [tui] <text>`. No React duplicate-key warnings in log.

### BUG-247 / v0.3.61 — 'stop'/'abort' has no effect
**Severity:** P1
**Status:** FIXED (v0.3.60 — observed working 2026-03-25, no dedicated commit; likely resolved by BUG-243 tab-switch + existing requestAbort wiring)
**Task:** v0.3.61
**Found:** 2026-03-25
**Note:** User confirmed stop/abort is working as of v0.3.60. Full abort of in-progress LLM streaming not independently verified — flag for regression watch.
**Files:** `src/tui/App.tsx` (handleInput stop handler), `src/auth/operator.js` (requestAbort)
**Acceptance:** Typing 'stop' or 'abort' halts the pipeline, confirms to the user, and returns to idle.
