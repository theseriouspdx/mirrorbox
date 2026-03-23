# CHANGELOG.md

## [1.0.0] - 2026-03-11
### Added
- **Sovereign Loop (1.0-09)**: MBO successfully patches its own codebase and promotes changes from Mirror to Subject World (`MBO_Alpha`). Verified via Relay listener and Audit Gate.
- **Assumption Ledger (1.0-10)**: Implemented Section 27 protocol in `operator.js`. Pre-execution audit of task assumptions with entropy scoring and hard blocker enforcement.
- **Relay & Telemetry**: Real-time event streaming via EventEmitter in `EventStore` and `/stream` SSE endpoint in `mcp-server.js`.
- **Infrastructure**: Added `bin/pile_deploy.py` for Merkle-validated Mirror → Subject promotion and `bin/validator.py` for entropy tax enforcement.
- **Milestone 1.0 Close**: All nine security invariants verified via External Invariant Test Suite.

## [0.9.2] - 2026-03-10
### Added
- Sovereign Factory Protocol (Fortress 2.0).
- bin/handshake.py: Merkle-verified permission elevation.
- bin/validator.py: Entropy Tax enforcement (LOC, CC, Nesting, Imports).
- bin/init_state.py: Day Zero baseline utility.
- .git/hooks/pre-commit: Physical enforcement gate.
- Section 12 to AGENTS.md (Operational Workflow).
- Invariant 10 & 11 to SPEC.md.

... [rest of changelog]
