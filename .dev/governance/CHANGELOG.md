# CHANGELOG.md
## Mirror Box Orchestrator — Project Evolution

---

### [0.6.2] — 2026-03-09
#### Added
- **Tier 3 DID (Claude wins reconciliation)**: Background MCP process isolation via PID files.
  - `scripts/mbo-start.sh`: Added `--agent=<claude|gemini>` flag; writes `$$` to `.dev/run/{agent}.pid` before `exec` so PID file targets the node process exactly.
  - `scripts/mbo-session-close.sh`: Added `--terminate-mcp --agent=<name>` branch; SIGTERM → 5s grace → SIGKILL; stale PID detection and cleanup.
  - `AGENTS.md §1.5`: Mandates background start with `--agent`; PID verification step; agent identity table; updated client config table.
  - `AGENTS.md §6C`: Added step 2 — terminate MCP via `mbo-session-close.sh --terminate-mcp`; renumbered steps.
  - `BUGS.md`: Filed BUG-036 (P2) — `mcp-server.js` `shutdown()` missing WAL checkpoint before `process.exit(0)`.

### [0.6.1] — 2026-03-09
#### Added
- **0.6-01**: Operator & Session Manager implemented (`src/auth/operator.js`).
  - Fixed `sendMCPRequest` timeout leak (`clearTimeout` on resolve and reject).
  - Added `getSafelist()` + `_fileExists()` for Tier 0 gate enforcement (safelist membership + physical file existence).
  - Added `confidence < 0.6` clarifying question gate in `classifyRequest`.
  - `summarizeSession` live via `callModel`; placeholder guard; replaces session history; logs `[CONTEXT RESET]`.
  - `getGraphCompleteness()` queries `edges WHERE source = 'runtime'` — no longer hardcodes `'skeleton'` for runtime.
  - `processMessage` logs classification + routing to event store before state snapshot.
- **`src/index.js`**: Operator initialized, MCP started, stdin REPL loop, clean shutdown on close.

### [0.6.0] — 2026-03-09
#### Added
- **0.6-00**: Universal MCP Session Start (DID-validated, Claude + Gemini reconciled).
  - Created `scripts/mbo-start.sh`: vendor-agnostic MCP loader for Claude CLI, Gemini CLI, Python orchestrators.
  - All status output routed to stderr; stdout reserved strictly for JSON-RPC.
  - Dynamic `DB_PATH` resolution via `--mode=dev` / `--mode=runtime` flags.
  - `PRAGMA integrity_check` + `PRAGMA wal_checkpoint(TRUNCATE)` on every launch for integrity and stale WAL recovery.
  - Added `--check` passthrough (early-exit for check-only mode is P2 follow-on).
- **AGENTS.md Section 1.5**: Mandates `mbo-start.sh` as source of truth for MCP lifecycle for all future agents and vendors.

---

### [0.5.1] — 2026-03-09
#### Added
- **Invariant 11 Enforcement**: Updated `src/auth/call-model.js` with a hard blockade against proprietary search tools (`grep`, `codebase_investigator`).
- **Tool Agnosticism**: Mandated the use of MBO MCP tools for all codebase discovery operations.
#### Fixed
- **Milestone 0.6.0 Investigation**: Confirmed "Operator" is currently unimplemented and mapped the integration path in `src/auth/call-model.js`.

---

### [0.4.3] — 2026-03-09
#### Added
- **0.4B-02**: Implemented Intelligence Graph MCP Server.
  - Exposed 5 tools via `StdioServerTransport`: `graph_query_impact`, `graph_query_callers`, `graph_query_dependencies`, `graph_query_coverage`, `graph_search`.
  - Integrated `@modelcontextprotocol/sdk` (Node.js).
  - Created `scripts/test-mcp-server.js` for tool verification.
- **0.4B-03**: Implemented SPEC.md indexing.
  - Added `scanMarkdown` to `StaticScanner` for regex-based header extraction (## Section, ### Sub-header).
  - Indexed headers as `spec_section` nodes with `DEFINES` edges from the file node.
  - Created `test-spec-indexing.js` for verification.
- **0.4B-04**: Coordinate Precision and Integrity Refactoring.
  - Updated `src/graph/static-scanner.js` to capture identifier-level coordinates (`nameStartLine`, `nameStartColumn`).
  - Updated `enrich` logic to use both line and column for precise LSP symbol matching, preventing same-line collisions.
  - Implemented **Stale Symbol Purge** (Adversarial Finding #5): `scanFile` now purges all existing nodes/edges owned by a file before re-scanning.
  - Exposed `graph_update_task` MCP tool for incremental graph updates after task completion.
- **0.4B-05**: No-LSP Fallback and Robustness.
  - Implemented **Robust Warmup** (Adversarial Finding #1): Added 3-attempt retry loop with 500ms backoff for LSP requests during indexing.
  - Implemented graceful detection and user notification for missing LSP servers.
  - Implemented global process registry in `LSPClient` to prevent orphan child servers.
  - Added `SIGTERM` and `uncaughtException` handlers to `mcp-server.js`.
#### Changed
- **GraphStore**: Fixed Invariant 7 (Adversarial Finding #3) — `upsertEdge` now prevents `static` scan from overwriting `runtime` source.
- **GraphStore**: Improved `getGraphQueryResult` subsystem heuristic and ID formatting for Section 13 compliance.
- **DBManager**: Added virtual columns and index (`idx_nodes_coords`) for coordinate-based symbol lookups.
- **Dependencies**: Added `@modelcontextprotocol/sdk` to `package.json`.

---

### [0.4.2] — 2026-03-09
#### Added
- **0.4B-01**: Implemented LSP enrichment for cross-file call resolution and import edges.
  - Created `src/graph/lsp-client.js` with `vscode-jsonrpc` for stdio transport.
  - Implemented `LSPClient` lifecycle: R-01 (rootUri), R-02 (waitForReady), R-03 (didOpen/didClose), R-05 (ephemeral shutdown), and R-06 (Watchdog registration).
  - Implemented cross-file `resolveDefinition` and `getCallHierarchy` (incoming/outgoing).
  - Added `resolveImport` Spec Extension to `GraphStore` for atomic placeholder rewriting.
#### Changed
- **Scanner Enrichment**: 
  - Updated `src/graph/static-scanner.js` to store 0-indexed position metadata (R-04).
  - Implemented Phase 2 `enrich(projectRoot)` logic with file-grouping (R-03) and robust `json_extract` metadata lookups.
  - Integrated `LSPClient` auto-detection for TypeScript, JavaScript, and Python.
- **Dependencies**: Added `vscode-jsonrpc` and `vscode-languageserver-protocol` to `package.json`.
#### Fixed
- **BUG-033**: Enforced ephemeral `LSPClient` instances to prevent task-boundary coupling.
- **BUG-035**: Verified `db.get()` existence in `db-manager.js` for enrichment pass lookups.

---

### [0.4.1] — 2026-03-09
#### Added
- **0.4A-03**: Implemented Intelligence Graph queries and BUG-009.
  - Added `getCallers`, `getDependencies` (refined for imports/calls), and `getImpact` (recursive 3-degree) to `GraphStore`.
  - Implemented `content_hash` staleness logic in `StaticScanner`. Uses SHA-256 hashing to skip redundant re-scans.
- **0.4A-04**: Implemented Section 13 `GraphQueryResult` formal contract in `GraphStore`.
#### Fixed (0.4A Structural Audit)
- **Structural Reconciliation**: Removed hallucinated methods (`findNodeByPath`) and fixed SQL syntax errors introduced during execution.
- **Database Integrity**: Scrubbed databases of garbage nodes; verified zero unapproved metadata fields remain.
- **Event Store Chain**: Verified chain integrity through seq 18 following a `RECOVERY` reconciliation event.

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

*Last updated: 2026-03-09*

## [0.6.0-prep] - 2026-03-09
### Added
- Pre-0.6 Adversarial Audit PASS.
- mirrorbox.db schema migration and LSP coordinate verification.
- src/auth/call-model.js: event store logging for prompt/response.
- scripts/mbo-session-close.sh: atomic backup and integrity check.
### Fixed
- src/auth/model-router.js: repaired syntax error in routing logic.
- src/auth/call-model.js: strengthened injection heuristic check.
