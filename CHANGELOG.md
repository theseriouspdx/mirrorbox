# CHANGELOG.md
## [0.8-08] - 2026-03-10
### Fixed
- **BUG-013**: Implemented CLI sandbox interaction focus mechanism via `ctrl+f`.
- **BUG-036**: Implemented clean shutdown WAL checkpointing in `mcp-server.js`.
- **BUG-042**: Populated `graphSummary` in Stage 11 update to enable HardState truncation logic.
- **BUG-010**: Added max retry limit (3) for Tiebreaker code derivation loop.
- **BUG-011**: Defined HardState truncation priority.
- **BUG-012**: Added max recoveryAttempts limit (3) for pipeline failure loop.
- **src/index.js**: Enabled raw mode and keypress detection.
- **src/auth/operator.js**: Added `sandboxFocus` state and `processMessage` interception.

## [0.9.2] - 2026-03-10
### Added
- Sovereign Factory Protocol (Fortress 2.0).
- bin/handshake.py: Merkle-verified permission elevation.
- bin/validator.py: Entropy Tax enforcement (LOC, CC, Nesting, Imports).
- bin/init_state.py: Day Zero baseline utility.
- .git/hooks/pre-commit: Physical enforcement gate.
- Section 12 to AGENTS.md (Operational Workflow).
- Invariant 10 & 11 to SPEC.md.

## [0.8.0] - 2026-03-10
### Added
- Milestone 0.8 Sandbox foundation complete.
- Pre/post comparison and regression detection.
