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


### BUG-144: Onboarding role exceeds token budget during re-onboarding loop, exposing stack trace and blocking runtime | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js` (`runOnboarding` callModel onboarding role), `src/index.js` startup onboarding gate
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19 during installer-first Alpha validation
- **Task:** v0.11.36
- **Description:** During root-mismatch re-onboarding in `/Users/johnserious/MBO_Alpha`, onboarding prompt/context grows until the onboarding role exceeds its token budget (`[BUDGET_EXCEEDED] Input tokens (3612) exceed budget (3000)`), then throws and aborts startup.
- **Observed output:** budget error followed by stack trace and operator respawn behavior.
- **Expected:** onboarding remains within budget (or degrades gracefully) without user-facing stack traces, and runtime reaches normal operator prompt.
- **Acceptance:** Installer-first TTY launch in `MBO_Alpha` completes onboarding and reaches runtime prompt with no onboarding `BUDGET_EXCEEDED` error.

### BUG-145: Self-run warning banner shown in Alpha runtime due to controllerRoot drift in global config | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js` (`setSelfRunWarningEnv`), `~/.mbo/config.json` metadata stamping
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19 during installer-first Alpha validation
- **Task:** v0.11.36
- **Description:** Warning banner `MBO SHOULD NOT BE RUN FROM THE MBO DIRECTORY` is shown while running from `/Users/johnserious/MBO_Alpha` because global config currently sets `controllerRoot=/Users/johnserious/MBO_Alpha`. This creates false-positive path warnings in target runtime.
- **Expected:** warning only when cwd is inside true controller repo path (`/Users/johnserious/MBO`), not Alpha target runtime.
- **Acceptance:** `cd /Users/johnserious/MBO_Alpha && npx mbo` runs without controller-directory warning while `cd /Users/johnserious/MBO && npx mbo` still warns.
