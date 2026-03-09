# CHANGELOG.md
## Mirror Box Orchestrator — Project Evolution

---

### [0.4.0] — 2026-03-09
#### Added
- **0.4A-01**: Implemented Tree-sitter integration for `src/` scanning.
  - Extracted nodes (file, function, class) and edges (DEFINES, IMPORTS).
  - Fixed nodeSubclasses crash on Node v24 arm64 (passed full grammar objects).
- **0.4A-02**: Implemented `GraphStore` and `StaticScanner` as parameterized classes for instance separation (dev vs runtime).
#### Fixed (0.4A Audit Findings)
- **FAIL (Item 5)**: Reconciled `event-store.js` write path with migrated `chain_anchors` schema.
- **FAIL (Item 5)**: Reconciled `SPEC.md` Section 7 hash envelope with actual implementation fields.
- **WARN (Item 6)**: Corrected `AGENTS.md` dev-graph server reference to mark as future task.
- **scripts**: Updated `test-chain.js` to match `run_id` primary key.
#### Governance
- **AGENTS.md**: Updated Section 9 to mandate "Diff-Only Edits" and "Mandatory Peer Review" for high-risk tasks.

---

### [0.3.1] — 2026-03-08
#### Fixed
- **BUG-027**: Added `seq: number` and `prev_hash: string | null` to Event interface in SPEC.md.
#### Changed
- **SPEC.md**: Documented `chain_anchors` table and hash verification envelope in Section 7.
- **SPEC.md**: Split Milestone 0.4 into 0.4A (Skeleton) and 0.4B (Enrichment) in Appendix A.
- **SPEC.md**: Added Skeleton Graph Safety Invariant to Section 8.
- **SPEC.md**: Added Redaction Gate and Schema Validation to Section 10 Enforcement.
- **SPEC.md**: Documented implementation decision for Intelligence Graph MCP server (`@modelcontextprotocol/sdk`).
- **AGENTS.md**: Mandated DID protocol for all modifications to SPEC.md, AGENTS.md, or the governance directory in Section 2.
- **PRE-0.4-02**: Completed MCP server research spike. Documented rationale for using official SDK in Section 6.

---

### [0.3.0] — 2026-03-08
#### Added
- **0.3-01**: Implemented Radius One State and Event Foundation.
  - Implemented `db-manager.js` for SQLite initialization, integrity checks, and schema migration logic.
  - Implemented `event-store.js` with append-only deterministic chaining (seq-based ordering).
  - Implemented `redactor.js` to enforce Invariant 8 (Secret Firewall).
  - Implemented `state-manager.js` for snapshotting and session recovery.
  - Created `verify-chain.js` and `verify-chain.py` audit utilities.
#### Fixed (Radius One Audit Findings)
- **BUG-023**: Fixed redactor offset confusion in `String.replace()` by adding explicit capture groups.
- **BUG-024, BUG-026**: Upgraded chain hash to cover full `id, seq, stage, actor, timestamp, payload, parent_event_id, prev_hash` envelope. Added atomic `chain_anchors` mechanism and immutable chaining (single INSERT, no PENDING state).
- **BUG-025, BUG-028**: Fixed non-deterministic chain ordering by introducing transaction-assigned `seq` primary key.
- **BUG-027**: Fixed `recover()` silently corrupting state by restricting queries to `stage = 'STATE'` events.
- **BUG-029**: Gated DB corruption rollover behavior behind `NODE_ENV` to prevent silent destruction in production.

---

### [0.2.2] — 2026-03-08
#### Fixed
- **BUG-019 (P0)**: Implemented Section 10 firewall in `callModel`.
  - Added `context` parameter to `callModel`.
  - Implemented `<PROJECT_DATA>` XML wrapping and system directive enforcement.
- **BUG-020 (P1)**: Added explicit timeout handlers (`req.on('timeout')`) to `callLocalProvider` and `callOpenRouter` to prevent process hangs.
- **BUG-021 (P1)**: Resolved OpenRouter key inconsistency.
  - Exposed `key` from `detectOpenRouter`.
  - Unified key usage in `callOpenRouter` via the resolved provider config.
- **BUG-022 (P1)**: Re-aligned role routing with Section 11 vendor assignments.
  - Removed `findProvider` helper to prevent collapsing roles to local.
  - Enforced Claude-first for planners and Gemini-first for reviewer.
  - Implemented frontier-first logic for onboarding and tiebreaker roles.
- **Robustness**: Added binary existence guard to `callCliProvider` to prevent `spawnSync` crashes.

### [0.2.1] — 2026-03-08
#### Governance
- Added Section 9 (Strict Mode) to `.dev/governance/AGENTS.md`. Constrains agents from stylistic/linting changes without functional justification. Hard State rule renumbered to Section 10.
- Logged BUG-019 through BUG-022 from dual-audit (Claude DID + third-party audit) of Milestone 0.2 implementation. No code written this session — audit findings queued for next session with `go`.

### [0.2.0] — 2026-03-08
#### Added
- **0.2-05**: Unified `callModel` function with multi-provider round-trips.
  - Implemented `src/auth/call-model.js` supporting CLI (Claude, Gemini, OpenAI), Local (Ollama), and OpenRouter.
  - Verified round-trips with Gemini CLI and OpenRouter.
  - Added `.dev/governance/TECHNICAL_DEBT.md` for OpenAI/Ollama pending verification.
  - **Fixed P0/P1 issues via Adversarial Review**:
    - BUG-014: Resolved ghost binary crash in `session-detector.js`.
    - BUG-015: Added 30s timeout to CLI spawns in `call-model.js`.
    - BUG-016: Fixed JSON escaping for OpenAI CLI via `JSON.stringify`.
    - BUG-017: Re-aligned model routing with SPEC priority (Local > CLI > OpenRouter).
    - BUG-018: Implemented missing `tiebreaker` role in `model-router.js`.
- **0.2-04**: Model routing logic implementation.
  - Implemented `src/auth/model-router.js` with priority-based role mapping.
  - Priority established: Local > CLI Session > OpenRouter.
  - Verified deterministic mapping for all specification roles (Classifier, Planner, Reviewer, etc.).
- **0.2-03**: OpenRouter fallback operational.
  - Implemented `src/auth/openrouter-detector.js` prioritizing `OPENROUTER_API_KEY` environment variable.
  - Verified authentication and connectivity to OpenRouter API.
- **0.2-02**: Local model detection (Ollama, LM Studio).
  - Implemented `src/auth/local-detector.js` using HTTP health checks.
  - Verified detection of `Ollama` in Darwin environment.
- **0.2-01**: CLI session detection for Claude, Gemini, and OpenAI.
  - Implemented `src/auth/session-detector.js`.
  - Verified detection of `Claude Code` and `Gemini CLI` sessions in Darwin environment.
  - Soft auth checks for configuration and environment variables.

### [0.1.0] — 2026-03-08
#### Environment Foundation
- Initialized repository with governance documents (`AGENTS.md`, `SPEC.md`, `BUGS.md`, `projecttracking.md`).
- Established `Dual Independent Derivation (DID)` protocol.
- Verified Docker build environment.
- Verified cross-platform Gate 0 requirements.

---

*Last updated: 2026-03-08*
