# CHANGELOG.md
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
