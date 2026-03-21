# CHANGELOG.md
## [0.3.20+v0.11.181.v0.2.3] — 2026-03-20 — TUI (v.3)
### Added
- TasksOverlay now includes governance-doc viewing, scrollable task briefings, activation preflight notes, and inline task creation that writes back to `projecttracking.md`.
- TUI status surfaces now show operator activity shimmer, stage-aware model/token counts, per-panel token totals, `/setup`, command autocomplete, and pipeline stage navigation.
- Workflow audit tooling now supports deterministic `--world both` runs with mirror-then-subject execution, per-world logs, unified verdict reporting, and subject-only alpha execution in two-world mode.
- Full Ink v5 + React TUI (`src/tui/`) replacing the readline operator interface.
- 4-tab layout: OPERATOR, PIPELINE, EXECUTOR, SYSTEM — with 35% StatsPanel sidebar always visible.
- StatusBar (top): stage, model, task, elapsed, version.
- TabBar: tab indicators, audit border, help hints.
- InputBar: context-aware prompt prefix (`❯` / `[AUDIT]`).
- OperatorPanel (Tab 1): scrollable operator output + live Tokenmiser header (TM §30.3).
- PipelinePanel (Tab 2): streaming agent chunks routed by role.
- ExecutorPanel (Tab 3): diff-aware executor output.
- SystemPanel (Tab 4): MCP health, project root display.
- StatsPanel (right sidebar): pipeline stepper + session TM (actual vs raw cost, active model, files in scope).
- StatsOverlay (SHIFT+T or `/token`): full SESSION + LIFETIME + BY MODEL Tokenmiser breakdown with CO₂ avoided.
- TasksOverlay (`/tasks`): parses `.dev/governance/projecttracking.md` into a live task list.
- `useScrollableLines` hook: auto-scroll + user-scroll-lock for all panels.
- Canonical color palette (`colors.ts`): `C.pink`, `C.purple`, `C.teal`, `C.error`, `C.border.*`.
- ESM island (`src/tui/package.json` `"type":"module"`) for Ink v5 / yoga-layout compatibility inside CJS root.
- Entry point `bin/mbo-tui.js` + `mbo tui` subcommand with self-run guard.
- `tsconfig.tui.json`: `ES2022`, `bundler` moduleResolution, `react-jsx`, `DOM` lib.

### Governance
- Onboarding now seeds missing governance docs plus `.dev/spec/SPEC.md`, then rewrites the spec from the accepted working agreement so task briefings can use spec as the primary source.
- Pipeline prompts now carry an explicit prompt-agent versus CLI/tool execution boundary so only the CLI layer claims mutation, validation, audit, and persistence work.
- Added explicit version-lane assignment rules: `0.11.x` core/hardening/runtime, `0.2.x` scripting/audit/automation, `0.3.x` TUI/operator UX, `0.4.x` multithreading/concurrency.
- Grandfathered legacy bugs `BUG-001` through `BUG-184`; starting with `BUG-185`, new bugs use dual identifiers: `BUG-### / vX.Y.ZZ`.
- Added required pre-push/session-wrap governance reconciliation across `projecttracking.md`, `BUGS.md`, `BUGS-resolved.md`, `CHANGELOG.md`, and session handoff artifacts.

## [0.2.02] — 2026-03-20 — Workflow Audit / Auto-Run Script (v.2)
### Added
- `scripts/mbo-workflow-audit.js` — automated end-to-end workflow audit runner; executes a task against the alpha runtime with configurable `--task`, `--world`, `--alpha-root`, `--alpha-timeout-sec`, `--push-alpha`, and `--human-input` flags.
- `scripts/generate-run-artifacts.js` — generates and archives signed run artifacts (SHA-256, timestamps, git state) for each audit execution into `.dev/analysis/`.
- Alpha execution option (`--push-alpha`) for running audits against `MBO_Alpha` target with full artifact retention.
- `fix(audit)`: `auto-seed alpha onboarding` before e2e run to prevent onboarding-hang blocking automated runs.

## [0.2.01] — 2026-03-19 — Tokenmiser Routing Savings
### Added
- `getCostRollup()` in `src/state/db-manager.js` — per-model token_log rollup with counterfactual cost and routingSavings calculation.
- Routing savings block in `operator.js` `getStatus()` — shows per-model cost, actual total, counterfactual, and savings inline.
- Routing savings section in `tokenmiser-dashboard.js` SHIFT+T overlay — same data surfaced in the TUI panel.

## [0.11.25] — 2026-03-17
### Added
- Section 36 UX Copy Pack (UX-001..021) — Removed all Stage IDs, added [RECOMMENDED ACTION] tags to critical errors.
- Invariant 1 & 2 hardening for worktree environments.
- Proactive src/ lockdown in bin/mbo.js on project startup.
- BUG-086 project-root mismatch guard in onboarding flow.
- Optimized lock_src in bin/handshake.py (performance and OSError resilience).

## [0.10.09] — 2026-03-16
### Added
- SPEC-compliant 4-phase onboarding interview (§5)
- Support for configurable scanRoots from .mbo/config.json
- Non-TTY guard for onboarding
