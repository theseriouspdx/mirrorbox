## [0.8.0-pre] — 2026-03-10
### Added
- **Sandbox:** Milestone 0.8 Expanded Task Set (0.8-01 through 0.8-11).
- **Sandbox:** Section 16 Sandbox & Runtime Observation requirements integrated into project tracking.
- **Sandbox:** 0.8A Runtime Probe instrumentation specification.
- **Observability:** Token usage logging requirement (`token_log` table + `get_token_usage` MCP tool).

### Changed
- **Bugs:** Promoted BUG-013 (CLI sandbox interaction) to Milestone 0.8 P1.
- **Tracking:** Updated `projecttracking.md` with Sandbox-specific sub-tasks.
- **Spec:** Updated `SPEC.md` Section 10 & 17 for token observability and callModel usage recording.

## [0.7.1] — 2026-03-09
### Fixed
- **Audit:** Reconciled 4-Pass Audit findings from `audit-report.md`.
- **Security:** Aligned `PROJECT_DATA` type to `document` and added JSON output schema guards in `callModel`.
- **Operator:** Fixed Stage 4 consensus semantics to use `reviewer` role and only block on explicit verdicts.
- **Graph:** Implemented `markNodeStale` contract for BUG-009 and aligned placeholder metadata with `startLine`/`startColumn`.
- **Resilience:** Realigned `scripts/mbo-watchdog.sh` with Section 18 timeout-first termination policy.

## [0.7.0] — 2026-03-09
### Added
- **Audit:** Conducted 4-Pass Audit (Vault, Graph, Gavel, Watchdog) of MBO v2.0.
- **Audit:** Verified Invariant 3 (Go Gate), Invariant 6 (callModel), Invariant 7 (Blind Isolation), and Section 10 (Firewall).
- **Audit:** Verified Section 6 (Tree-sitter Graph) and BUG-009 (Staleness detection).
- **Audit:** Verified Section 14 (Blind Reviewer) and Section 15 (3-Block Tiebreaker).
- **Resilience:** Implemented Section 18 MCP Watchdog (`scripts/mbo-watchdog.sh`) to monitor for CPU pegging and hung processes.
- **Resilience:** Updated `scripts/mbo-start.sh` to launch and manage the watchdog lifecycle.
- **Operator:** Completed behavioral verification of DID pipeline (Stages 1-5).
- **Verification:** `audit-m0.7.js` results integrated into the final audit report.

## [0.6.6] — 2026-03-09
### Added
- **Safety:** Implemented `world_id` enforcement in `event-store.js` and `state-manager.js` (Invariant 10).
- **Safety:** Implemented pre-mutation `checkpoint()` mechanism in `state-manager.js` (Invariant 13).
- **Safety:** Refactored `db-manager.js` migrations to use non-destructive temporary table patterns (Invariant 15).
- **Operator:** Implemented structural Stage 5 Approval Gate with Tier 1+ "go" requirement (Invariant 3).
- **Operator:** Added robustness to `model-router.js` with explicit `operator` role mapping.
- **Lifecycle:** Ensured PID file creation for all agent roles in `mbo-start.sh`.

## [0.6.5] — 2026-03-09
### Added
- **Operator:** Improved context window threshold detection with accurate token estimation (`_estimateTokens`).
- **Operator:** Integrated refined summarization prompt that preserves active tasks, decisions, and `HardState`.
- **Operator:** Implemented `HardState` budget enforcement (5,000 tokens) with Section 13 priority truncation.
- **callModel:** Added `HardState` injection as an immutable header in every model call.
- **Verification:** Verified summarization and `HardState` preservation via mock-based unit tests.

## [0.6.4] — 2026-03-09
### Added
- **Operator:** Wired classifier and operator roles to real providers in `call-model.js`.
- **Operator:** Removed "Response placeholder" heuristic fallback branches.
- **Operator:** Added robustness to `graph_query_impact` tool result parsing.
- **Verification:** Verified Tier 0-3 routing end-to-end with live model classification.

## [0.6.3] — 2026-03-09
### Added
- **Experiment E2 (Gemini CLI):** Cross-Model Consistency measurement complete.
- **Experiment E2:** Documented 44x token inflation (92k vs ~2k) caused by literal Gate 0 compliance without pre-started MCP.
- **Experiment E2:** Created `.dev/reports/E2B-gemini-full-load-measurement.md` with detailed tool sequence and token metrics.

## [0.6.2] — 2026-03-09
### Added
- **Operator:** Tier 0-3 routing implementation complete.
- **Operator:** Safelist gate and graph-based blast radius check implemented.
- **Operator:** Dynamic context window management and MCP shutdown cleanup.
- **callModel:** Full implementation with CLI, OpenRouter, and Local dispatchers.
- **Firewall:** Section 10 XML tagging and firewall directive enforcement.
- **Security:** Secret isolation (OpenRouter key removed from routing state).
- **Redaction:** Automatic payload scrubbing for all Event Store logs.
- **Validation:** Tier 0-3 routing matrix verified 4/4 PASS.

## [0.5.0] - 2026-03-09
### Added
- Section 5 (Session Management & Two-World Integrity) to AGENTS.md.
- Invariants 10-16 for Two-World isolation, graph investigation loops, and HardState budgeting.
- Secret redaction patterns for OpenRouter, Stripe, AWS, and generic high-entropy tokens.

### Changed
- Unified src/auth/call-model.js with Section 10 Firewall and HardState management.
- Implemented 5,000-token HardState budget enforcement with priority truncation.
- Added XML-based <PROJECT_DATA> tagging for context isolation.
- Migrated mirrorbox.db nodes table with virtual coordinate columns.
