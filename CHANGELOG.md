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
