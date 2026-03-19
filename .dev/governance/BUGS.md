## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-151

---

### BUG-086: `mbo setup` accepts copied profile from a different project — no project root validation | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js` (`checkOnboarding`)
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-19 — legacy profiles without `projectRoot` now force `profile_drift` re-onboarding. Regression test added: `scripts/test-bug-086-149.js` (`testBug086LegacyProfileWithoutRootTriggersDrift`).
- **Task:** v0.11.86
- **Description:** When `.mbo/onboarding.json` is copied from another project, `checkOnboarding` validates the schema but never checks whether the profile's origin matches the current project root. A foreign profile passes validation and the onboarding interview is skipped entirely.
- **Fix shipped:** `buildProfile` now stores `projectRoot` in the profile. `checkOnboarding` compares stored root vs current cwd via `fs.realpathSync`.
- **Validation result (2026-03-16 FAIL):** Fresh-install test produced no warning and no interview — daemon started silently.
- **Root cause of failure:** Guard is `if (activeProfile && activeProfile.projectRoot)` — bypassed when `projectRoot` field is absent (profiles written before this fix have no `projectRoot`). MBO controller's own `onboarding.json` was pre-fix, so copied profiles always slip through.
- **Required re-fix:** Guard must handle absent `projectRoot` as a mismatch, not a pass. Treat missing field as foreign profile. Task v0.11.86 in progress.
- **Acceptance:** `rm -rf MBO_Alpha && cp -r MBO/. MBO_Alpha/ && node bin/mbo.js setup` triggers `[SYSTEM]` root-mismatch warning and re-runs interview.

### BUG-144: Onboarding role exceeds token budget during re-onboarding loop, exposing stack trace and blocking runtime | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js` (`runOnboarding` callModel onboarding role), `src/index.js` startup onboarding gate
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-19 — root cause was JSON-as-protocol (BUG-147). Eliminated by sentinel architecture rewrite. Budget pressure gone: scan data now passed as plain text (~200 tokens vs ~800 for JSON.stringify), no growing transcript per turn.
- **Task:** v0.11.36
- **Resolved by:** BUG-147 fix in `src/cli/onboarding.js`

### BUG-145: Self-run warning banner shown in Alpha runtime due to controllerRoot drift in global config | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js` (`setSelfRunWarningEnv`), `~/.mbo/config.json` metadata stamping
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19 during installer-first Alpha validation
- **Task:** v0.11.36
- **Description:** Warning banner `MBO SHOULD NOT BE RUN FROM THE MBO DIRECTORY` is shown while running from `/Users/johnserious/MBO_Alpha` because global config currently sets `controllerRoot=/Users/johnserious/MBO_Alpha`. This creates false-positive path warnings in target runtime.
- **Expected:** warning only when cwd is inside true controller repo path (`/Users/johnserious/MBO`), not Alpha target runtime.
- **Acceptance:** `cd /Users/johnserious/MBO_Alpha && npx mbo` runs without controller-directory warning while `cd /Users/johnserious/MBO && npx mbo` still warns.

### BUG-149: No validator guard against JSON-as-protocol in LLM prompts — lets BUG-147 class of violation recur silently | Milestone: 1.1 | RESOLVED
- **Location:** `bin/validator.py`, `src/auth/call-model.js`
- **Severity:** P2
- **Status:** RESOLVED — 2026-03-19
- **Task:** v0.11.86
- **Description:** BUG-147 survived undetected across multiple sessions because (a) the test suite's `nonInteractive` bypass skips `callModel` entirely in all onboarding tests, and (b) no static check prevents an agent from re-introducing JSON-as-protocol in future `callModel` prompt strings. The constraint exists in `.dev/preflight/onboarding-conversational-model.md` and SPEC Section 36 but is not machine-enforced.
- **Fix:** Added validator rule `validate_no_json_protocol_prompts()` in `bin/validator.py` that fails on JSON-as-protocol prompt patterns in `src/**/*.js` and `personalities/**/*.md` (with allowlist for inert/transport JSON content). Removed JSON response-schema enforcement from `src/auth/call-model.js` so model communication is plain-English only. Added regression test `scripts/test-bug-086-149.js` (`testBug149LiveInterviewPathUsesCallModelAndPersists`) that exercises `runOnboarding` live interview path with a mocked provider and verifies persistence.
- **Acceptance:** `python3 bin/validator.py --all` passes with guard active. `node scripts/test-bug-086-149.js` passes and confirms live interview path hits `callModel` and writes `onboarding.json`.

### BUG-147: JSON used as onboarding LLM communication protocol — violates Section 36 thin-shell contract | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js` (interview loop), `personalities/onboarding.md`
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-19
- **Task:** v0.11.36
- **Root cause:** Interview loop instructed onboarding LLM to return `type:"question"` / `type:"persist"` JSON every turn for shell routing. Also passed `JSON.stringify(scan)` as raw blob each turn. Made JSON the communication language, exploding token usage and causing BUDGET_EXCEEDED (BUG-144). Introduced in v0.11.22 (Adaptive Onboarding v2) — agent chose JSON routing as the path of least resistance, did not read `.dev/preflight/onboarding-conversational-model.md` or reconcile against Section 36. Test suite's `nonInteractive` bypass meant the live path never failed in CI.
- **Fix:** Replaced per-turn JSON protocol with plain-English conversation + single `---WORKING AGREEMENT---` sentinel at Phase 5 only. Shell detects sentinel, parses fields once, builds profile. Scan data passed as human-readable briefing text. Prior profile passed as condensed plain-text summary on re-onboard (Section 5/UX-024), never grows. Working Agreement displayed before persist per Section 36.3.
- **Also fixes:** BUG-144 (budget overflow — eliminated by token reduction), stray `json` token in `personalities/onboarding.md`.
- **Acceptance:** Installer-first TTY launch in `MBO_Alpha` completes onboarding with no `BUDGET_EXCEEDED`, no JSON parse warnings, Working Agreement displayed before persist, profile written correctly.

### BUG-148: JSON.stringify(plan) used as LLM prompt input in operator pipeline stages | Milestone: 1.1 | RESOLVED
- **Location:** `src/auth/operator.js` (`runStage4`, `runStage4D`, `evaluateCodeConsensus`, `evaluateSpecAdherence`)
- **Severity:** P2
- **Status:** RESOLVED — 2026-03-19
- **Task:** v0.11.36
- **Root cause:** Plan objects (output of `_extractDecision` from plain-English LLM responses) were serialized via `JSON.stringify` and injected back into subsequent LLM prompts. This is a round-trip violation: plain English → parsed JS object → JSON blob → LLM reads JSON. The LLM originally produced plain-English sections; the shell parsed them into a JS object for internal routing; then re-serialized that object as JSON to pass to the next LLM call. No structural benefit — LLMs read prose as well as JSON, and the content originated as prose.
- **Fix:** Added `renderPlanAsText()` in `onboarding.js` (exported for operator use). Replaces all four `JSON.stringify(plan/planA/planB/concerns)` instances in LLM-facing prompts with labeled plain-text sections matching the format the LLM originally produced. `reviewer.concerns` rendered as numbered list. `planA`/`planB` in `evaluateSpecAdherence` rendered side-by-side as labeled sections.
- **Note:** `JSON.stringify(plan)` at line 1770 (`computeContentHashes`) is NOT a violation — that's blind-isolation hashing (Invariant 7), not LLM prompt injection.
- **Acceptance:** No `JSON.stringify(plan*)` in any LLM-facing prompt string. `renderPlanAsText` used at all four call sites. Operator pipeline produces same routing outcomes.

### BUG-150: Tool context token consumption is invisible to MBO cost tracking — affects all agents | Milestone: 1.1 | OPEN
- **Location:** `src/state/stats-manager.js`, `src/auth/call-model.js`, `token_log` schema
- **Severity:** P2
- **Status:** OPEN
- **Task:** unassigned
- **Description:** `token_log` and `stats-manager` track tokens consumed by `callModel` invocations only. Every token burned outside `callModel` — tool output landing in agent context — is invisible to MBO's cost model. This affects all agents differently and unpredictably:
  - **Gemini codebase explorer:** semantic expansion tool, proactively loads broad file context before any model call. Token cost per invocation is unknown and uncontrolled. Could load dozens of files and their dependency chains.
  - **Codex:** opaque context management, unknown expansion behavior per session.
  - **Claude (DC tools):** `read_multiple_files`, `read_file`, `list_directory` all land in context. Predictable per call but uncounted cumulatively.
  - **All agents — graph queries:** `graph_search` and `graph_query_impact` MCP results land in agent context. Broad queries can return thousands of tokens of node/edge data with no budget guard.
- **Root cause of discovery:** Async search tool returned partial results for BUG-146 lookup — led to analysis of why search tool behavior varies across agents and how token cost of that behavior is untracked.
- **Impact:** MBO's savings dashboard (optimized vs raw) only reflects `callModel` optimization. Actual total session cost per agent is unknown. Gemini sessions with codebase explorer active may be dramatically more expensive than token_log suggests. Cross-agent cost comparison is meaningless without this data.
- **Required fix:**
  1. Add `tool_token_log` table to `mirrorbox.db`: `(id, session_id, agent, tool_name, estimated_tokens, timestamp)`. Each agent logs tool invocations with estimated token cost of the result.
  2. Add `estimateToolTokens(result)` utility — applies same `length/4` heuristic to tool output text before it's consumed.
  3. For MBO-controlled tools (DC, MCP graph queries): instrument at the call site in `operator.js` and `callModel` context wrappers.
  4. For agent-native tools (Gemini codebase explorer, Codex file search): governance rule — agents MUST log estimated token cost of any context-loading tool call to `tool_token_log` at session start via MCP `graph_update_task` or a dedicated `log_tool_usage` MCP endpoint.
  5. `getStatus()` and the stats dashboard should surface: `callModel tokens` + `tool context tokens` = `total session tokens`, broken down by agent.
- **Known unknowns:** Gemini codebase explorer's exact expansion algorithm is not documented in MBO governance. Before fix can be fully specified, need to instrument a Gemini session and measure actual tool output token counts. Add to BUG-149 validator scope: warn when `graph_search` result exceeds 2000 tokens with no explicit budget set.
- **Acceptance:** `getStatus()` reports total session token cost including tool context. Cross-agent sessions for the same task show comparable and auditable token breakdowns. `tool_token_log` populated for at least DC and graph query tool calls.
