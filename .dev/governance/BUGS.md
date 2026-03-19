## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-147

---

### BUG-086: `mbo setup` accepts copied profile from a different project — no project root validation | Milestone: 1.1 | PARTIAL
- **Location:** `src/cli/onboarding.js` (`checkOnboarding`)
- **Severity:** P1
- **Status:** PARTIAL — fix shipped but validation failed 2026-03-16. Root cause identified, re-fix pending.
- **Task:** v0.11.86
- **Description:** When `.mbo/onboarding.json` is copied from another project, `checkOnboarding` validates the schema but never checks whether the profile's origin matches the current project root. A foreign profile passes validation and the onboarding interview is skipped entirely.
- **Fix shipped:** `buildProfile` now stores `projectRoot` in the profile. `checkOnboarding` compares stored root vs current cwd via `fs.realpathSync`.
- **Validation result (2026-03-16 FAIL):** Fresh-install test produced no warning and no interview — daemon started silently.
- **Root cause of failure:** Guard is `if (activeProfile && activeProfile.projectRoot)` — bypassed when `projectRoot` field is absent (profiles written before this fix have no `projectRoot`). MBO controller's own `onboarding.json` was pre-fix, so copied profiles always slip through.
- **Required re-fix:** Guard must handle absent `projectRoot` as a mismatch, not a pass. Treat missing field as foreign profile. Task v0.11.86 in progress.
- **Acceptance:** `rm -rf MBO_Alpha && cp -r MBO/. MBO_Alpha/ && node bin/mbo.js setup` triggers `[SYSTEM]` root-mismatch warning and re-runs interview.

### BUG-141: Classifier BUDGET_EXCEEDED — sessionHistory/stateSummary leaking into classifier context | Milestone: 1.1 | FIXED
- **Location:** `src/auth/operator.js` → `classifyRequest()`
- **Severity:** P1 (runtime blocker — breaks E2E on any multi-turn session)
- **Status:** FIXED — 2026-03-19
- **Task:** v0.11.36
- **Description:** `classifyRequest()` was passing `{ userMessage, sessionHistory, stateSummary }` as context to the `classifier` role (1500-token input budget). After even one prior turn, `sessionHistory` pushed input to 1667+ tokens → `[BUDGET_EXCEEDED]` → heuristic fallback → degraded Stage 1.5 ledger.
- **Fix:** Stripped `classifyRequest()` context to `{ userMessage }` only. Budget stays at 1500, permanently immune to history growth.
- **Known tradeoff:** Classifier loses session-history awareness. If needed later, raise `DEFAULT_TOKEN_BUDGETS.classifier.input` first — do not re-add raw history.
- **Acceptance:** Alpha E2E with multi-turn prompts completes classification without `[BUDGET_EXCEEDED]`.

### BUG-142: Worktree auth/bootstrap friction — inconsistent root and session display | Milestone: 1.1 | FIXED
- **Location:** `bin/handshake.py`, `bin/mbo.js`
- **Severity:** P2
- **Status:** FIXED — 2026-03-19
- **Task:** v0.11.36
- **Description:** Fresh worktrees without `.journal/state.json` hard-exited on `--status`. Auth scope displayed as `src` not `.`. Risk confirmation required `yes` not `y`. Auth subcommands did not force `MBO_PROJECT_ROOT` to resolved project root.
- **Fix:** Auto-init state on first use; `_display_scope` normalizes to `.`; accept `y`/`yes`; `authEnv` forces root in all subprocess calls.
- **Acceptance:** Fresh worktree runs `mbo auth status` without pre-existing state.json; shows `[SESSION] Active: .`

---

*Last updated: 2026-03-19 — BUG-146 moved to BUGS-resolved.md after hardcoded MCP port eradication and validator guardrail landed. Current outstanding set remains active-only.*

### BUG-143: `~/.mbo/config.json` `planner` key not recognized — architecturePlanner/componentPlanner left unrouted | Milestone: 1.1 | FIXED
- **Location:** `src/auth/model-router.js` → `routeModels()`, `~/.mbo/config.json`
- **Severity:** P1 (runtime blocker — planner roles get null config, pipeline hard-fails)
- **Status:** FIXED — 2026-03-19
- **Task:** v0.11.36
- **Description:** `mbo setup` writes a `planner` key to `~/.mbo/config.json`. The model router expects `architecturePlanner` and `componentPlanner` keys. The `planner` entry never matched, all three planner fallback checks (claude CLI, openrouter, ollama) also failed in the Alpha environment, and both planner roles were left as `null`. `callModel` then threw `No provider configured for role 'architecturePlanner'` on every `go`.
- **Fix 1:** Added `planner` → `architecturePlanner`/`componentPlanner` alias in the `opConfig` block before the roles loop. Non-destructive — only aliases when specific keys are absent.
- **Fix 2:** Added `cli.gemini.authenticated` as a planner fallback after openrouter, before ollama. Gemini is the working auth in this environment and already handles classifier/operator.
- **Acceptance:** `go` after a standard workflow prompt routes planners successfully without `No provider configured` error.
