# CHANGELOG.md
## [0.12.01] — 2026-03-19
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
