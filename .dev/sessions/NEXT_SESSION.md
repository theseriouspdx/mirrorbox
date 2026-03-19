# NEXT_SESSION — Installer-First Alpha Resume (BUG-144 blocker)

## Session state at wrap
- Installer-first flow is active (`mbo`/`npx mbo` only, no direct `node .../bin/mbo.js` for acceptance).
- Runtime copy path used: `/Users/johnserious/MBO` -> `/Users/johnserious/MBO_Alpha`.
- Dual transcript requirement remains:
  - `/Users/johnserious/MBO_Alpha/.mbo/logs/`
  - `/Users/johnserious/MBO/.dev/sessions/analysis`

## Active blockers discovered
- `BUG-144` (P1, OPEN): onboarding role budget overflow is back during root-mismatch re-onboarding.
  - Observed: `[BUDGET_EXCEEDED] Input tokens (3612) exceed budget (3000) for role onboarding`.
  - This currently blocks clean installer-first acceptance flow completion.
- `BUG-145` (P2, OPEN): self-run warning appears in Alpha due to `~/.mbo/config.json` `controllerRoot` drift.
  - Non-blocking, but noisy and misleading.

## Prime Directive (carry forward after bugs are fixed)
We are running the latest MBO from `/Users/johnserious/MBO` and validating an installer-first flow in `/Users/johnserious/MBO_Alpha`. Install from packaged artifact, run only via `mbo`/`npx mbo`, complete setup/onboarding plus one low-risk bug workflow, and finish with audit logs and clean state sync while preserving mandatory human approval boundaries.

Partnership model: adaptive operator partner. Ask dynamic onboarding questions based on detected governance artifacts (`projecttracking`, `BUGS`, roadmap/changelog). Drive one full workflow cycle in plain English, keep outputs user-facing (no raw JSON), capture transcript plus audit notes, and tie outcomes back to `projecttracking` and `BUGS` state.

## Next-session bootstrap prompt (paste this)
Resume MBO with installer-first end-user flow.
Project root: /Users/johnserious/MBO
Target runtime: /Users/johnserious/MBO_Alpha

Read first:
- /Users/johnserious/MBO/.dev/governance/AGENTS.md
- /Users/johnserious/MBO/.dev/governance/projecttracking.md
- /Users/johnserious/MBO/.dev/governance/BUGS.md
- /Users/johnserious/MBO/.dev/sessions/NEXT_SESSION.md

Session objective:
1. Fix BUG-144 first (onboarding BUDGET_EXCEEDED regression). Treat as blocker.
2. Keep installer-first contract strict:
   - Build/install from packaged artifact
   - Run only with mbo/npx mbo
3. Ensure acceptance runs are performed in TTY mode (interactive) until onboarding is stable.
4. Optionally address BUG-145 warning-path drift after blocker is fixed.
5. Validate full Alpha E2E cycle from /Users/johnserious/MBO_Alpha:
   - launch npx mbo (including setup/onboarding)
   - status
   - Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.
   - go
   - approved

Required checks:
- No BUDGET_EXCEEDED in user-visible output
- No malformed/non-JSON warning strings in user-visible output
- No planner fallback error strings listed in prior handoff/governance blockers
- Reaches audit prompt and state sync cleanly

Execution constraints:
- Copy latest codebase into Alpha before install/run when needed:
  - rsync from /Users/johnserious/MBO to /Users/johnserious/MBO_Alpha (excluding .git/node_modules)
- Install via:
  - /Users/johnserious/MBO/scripts/mbo-install-alpha.sh /Users/johnserious/MBO_Alpha
- Run via:
  - cd /Users/johnserious/MBO_Alpha && npx mbo
- Save transcript to both:
  - /Users/johnserious/MBO_Alpha/.mbo/logs/
  - /Users/johnserious/MBO/.dev/sessions/analysis

After run:
- Write fresh audit notes under /Users/johnserious/MBO/.dev/sessions/analysis
- Update governance task/bug state only for actual outcomes
