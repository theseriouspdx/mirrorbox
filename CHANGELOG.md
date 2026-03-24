# CHANGELOG.md
## Mirror Box Orchestrator — Public Release Notes

Internal workflow state lives in `.dev/governance/projecttracking.md`, `.dev/governance/BUGS.md`, and `.dev/governance/BUGS-resolved.md`.
This file is a minimal public-facing record of shipped version changes.

## [0.3.26] — 2026-03-24 — Tokenmiser Session + Project Truthfulness
### Fixed
- `/tm` now shows both session and project totals, keeps `/token` as an alias, and returns cleanly to the operator screen.

## [0.2.10] — 2026-03-24 — Deterministic Bug Audit Artifacts
### Added
- Bug-audit prompts now produce deterministic local audit artifacts instead of conversational-only output.

## [0.11.191] — 2026-03-24 — Canonical Governance Startup + Honest Session Reset
### Fixed
- Startup now uses the canonical ledger for outstanding-task state and resets fresh-session Tokenmiser stats honestly.

## [0.11.190] — 2026-03-24 — Governance Test Harness Repair + Verification
### Fixed
- Governance parser verification was repaired so the recent runtime/governance fixes could be validated reliably.

## [0.3.25] — 2026-03-24 — Runtime Task Numbering Integrity
### Fixed
- Runtime-created `0.3` tasks now advance correctly and no longer inherit stale ownership defaults.

## [0.2.09] — 2026-03-23 — Tokenmiser Counterfactual Truthfulness
### Fixed
- Tokenmiser savings now compare against a realistic no-routing baseline.

## [0.11.189] — 2026-03-23 — Read-Only Recovery Null-Verdict Hardening
### Fixed
- Read-only readiness-check recovery is now resilient to compact/null-verdict planning outputs.

## [0.3.23] — 2026-03-23 — TUI HandleInput Build Fix
### Fixed
- A TUI build blocker in `handleInput` was fixed so the operator flow builds and runs cleanly again.

## [0.11.188] — 2026-03-23 — Assumption-Ledger Gate Enforcement
### Fixed
- Tier 0 and read-only execution paths now respect the Stage 1.5 sign-off gate.

## [0.3.22_0.11.186] — 2026-03-23 — Test Suite Hardening + MCP Cleanup
### Fixed
- Hardened the test suite and cleaned up stale MCP launchd/process state.

## [0.3.20_0.11.181_0.2.03] — 2026-03-20 — TUI (v3) + Governance Alignment + Two-World Audit
### Added
- Shipped the Ink-based TUI, governance viewing/task activation surfaces, and the two-world workflow audit path.

## [0.2.02] — 2026-03-20 — Workflow Audit / Auto-Run Script
### Added
- Added the scripted workflow audit runner and signed run-artifact generation.

## [0.2.01] — 2026-03-19 — Tokenmiser Routing Savings
### Added
- Added routing-savings reporting to Tokenmiser.

## [0.11.26] — 2026-03-20 — Tool Context Token Visibility
### Fixed
- Tool-context token usage is now visible in cost/status reporting.

## [0.11.25] — 2026-03-20 — MCP Runtime Hardening
### Fixed
- Hardened graph/MCP runtime behavior around timeouts, queue recovery, and clean shutdown.

## [0.10.09] — 2026-03-16 — Onboarding Foundation
### Added
- Added the SPEC-aligned onboarding flow, scan-root configuration, and non-TTY protection.
