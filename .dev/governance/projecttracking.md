# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]
**Next Action:** Execute Task 1.1-H32 — mbo setup: agnostic client config + scan root detection

---

## MILESTONE 1.0 — Sovereign Loop [IN PROGRESS]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 1.0-03 | Implement The Relay (Cross-World Telemetry) — UDS + Guard + Pile | COMPLETED |
| 1.0-04 | Implement The Pile (Promotion Engine) | COMPLETED |
| 1.0-05 | Implement The Guard (Integrity Gatekeeper) | COMPLETED |
| 1.0-09 | Implement Sovereign Loop (Self-Patching Validation) | IN PROGRESS |

| Task ID | Task Description | Status |
|---------|------------------|--------|
| 1.1-01 | Fix BUG-051: DBManager DB path resolution (Section 28.8) | COMPLETED |
| 1.1-02 | Fix BUG-052: Create bin/mbo.js launcher + package.json bin entries (Section 28.1) | COMPLETED |
| 1.1-03 | Implement mbo setup wizard — ~/.mbo/config.json, provider detection (Section 28.6) | COMPLETED |
| 1.1-04 | Implement .mbo/ project init — directory walk, .gitignore guard (Section 28.3) | COMPLETED |
| 1.1-05 | Implement launch sequence — version check, re-onboard trigger (Section 28.5) | COMPLETED |
| 1.1-10 | Graph Server Trust Contract — server identity + client assertion | COMPLETED |
| 1.1-06 | Fix BUG-050: Validator failure halts pipeline, re-enters Stage 3A (Section 28) | COMPLETED |
| 1.1-07 | Implement Tokenizer module — scan, onboard, track (Section 29) | COMPLETED |
| 1.1-08 | Implement token accounting — event schema, live tally, session summary (Section 30) | COMPLETED |
| 1.1-09 | Wire Tokenmiser into MBO launch sequence as onboarding engine | COMPLETED |
| 1.1-11 | Implement MBO Handshake & 'No Assumptions' mandate | COMPLETED |

---

## MILESTONE 1.1 — Hardening (Executable Scope) [IN PROGRESS]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 1.1-H01 | Implement Project Root Resolution (walking up for .mbo/) | COMPLETED |
| 1.1-H02 | Implement Machine Config validation & corrupt-rename logic | COMPLETED |
| 1.1-H03 | Implement Non-TTY Guard & Env-Var output for CI | COMPLETED |
| 1.1-H04 | Implement .mbo/ Scaffolding and .gitignore Automator | COMPLETED |
| 1.1-H05 | Implement Authoritative Launch Sequence (Step 1-7) | COMPLETED |
| 1.1-H06 | Implement Tokenmiser Baseline & Current-Raw scan hooks | COMPLETED |
| 1.1-H07 | Implement TOKEN_USAGE event emission in call-model.js | COMPLETED |
| 1.1-H08 | Implement MCP Runtime Contract v3 (99/1 Reliability) | COMPLETED |
| 1.1-H09 | Implement Tokenmiser Value-Tracking ($chars/4 baseline) | COMPLETED |
| 1.1-H10 | Implement SHIFT+T Stats Overlay & Persistence (.mbo/stats.json) | COMPLETED |
| 1.1-H11 | Implement Agent Header status bar (Green/Red metrics) | COMPLETED |
| 1.1-H12 | Canonicalize AGENTS.md — update root doc, create src/templates/AGENTS.md for subject projects | COMPLETED |
| 1.1-H13 | Directory structure cleanup — move root strays to scripts/, delete scratch files, update .gitignore | COMPLETED — 2026-03-15 |
| 1.1-H14 | Multi-agent dev workflow design — role assignments for Claude/Gemini/Codex, DID protocol across tools, handoff format | COMPLETED — 2026-03-13 — see `.dev/governance/DID-PROTOCOL.pdf` |
| 1.1-H15 | Fix BUG-057: MCP stream-destroyed incident — safeHandleTransportRequest + SSE guard + autoRefreshDevIfStale queue serialization | COMPLETED |
| 1.1-H16 | Fix BUG-061: Merkle scope drift + MCP query path drift (manifest-only endpoint + canonical root assertion + preflight command hardening) | COMPLETED |
| 1.1-H17 | Fix BUG-062: In-app human-mediated auth flow (no CLI dependency) + self-run/non-TTY auth usability | COMPLETED |
| 1.1-H18 | Fix BUG-064: mcp_query initialize timeout via wrong endpoint selection and weak fallback | COMPLETED |
| 1.1-H19 | Fix BUG-065: preserve dynamic env endpoint + POST preflight to avoid TCP-only MCP hangs | COMPLETED |
| 1.1-H20 | Fix BUG-066: always route initialize to fresh transport instance in MCP server | COMPLETED |
| 1.1-H21 | Fix BUG-067: keep `mbo auth` usable in controller repo while runtime remains guarded | COMPLETED |
| 1.1-H22 | Temporary MCP-disabled operations mode in controller repo; route agents to legacy workflow | SUPERSEDED — see 1.1-H23 |
| 1.1-H23 | Migrate MCP to launchd-owned system daemon — delete mbo-start.sh/watchdog/manifests, surgery on mcp-server.js + operator.js, add mbo setup/teardown | COMPLETED |
| 1.1-H30 | Hardening: Project-scoped MCP Isolation — ephemeral ports, identity enforcement (root + projectId), atomic manifests, legacy daemon cleanup | COMPLETED — 2026-03-15 |
| 1.1-H31 | Fix Scan Health Regression — investigate failed_critical status in MBO (3 fails) and johnseriouscom (1 fail) reported by graph_server_info | COMPLETED — 2026-03-16 |
| 1.1-ISS-02 | Fix DB path resolution regression in test scripts (BUG-051 aftershock) — misidentified as concurrent append | COMPLETED |
| 1.1-ISS-03 | Add npm test script — create tests/run-all.js runner for all active test files; add "test" and "start" entries to package.json scripts; no CI currently, npm test errors | COMPLETED — 2026-03-16 |
| 1.1-H32 | mbo setup: agnostic client config + scan root detection — (1) scan root detection: walk project, identify source dirs by heuristic (src/, js/, py files, package.json, etc.), prompt user to confirm, write scanRoots to <project>/.mbo/config.json; mcp-server.js reads scanRoots from config with ['src'] fallback. (2) client config registry: after daemon healthy, write MCP URL to all detected clients (Claude→.mcp.json, Gemini→.gemini/settings.json, Codex→TBD, extensible); refresh on mbo mcp recovery. (3) reinstall on johnseriouscom and MBO_Alpha after implementation. | COMPLETED — 2026-03-16 |
| 1.1-H24 | Implement DID protocol in operator pipeline — wire Gemini-as-A, Claude-as-B, Codex tiebreaker into callModel routing; enforce blind derivation context isolation; add reconciliation output format and retry gate | COMPLETED — 2026-03-13 — DID v2 reconciled logic implemented in src/auth/did-orchestrator.js |
| 1.1-H25 | Security Hardening: restore Section 8 Affirmation Protocol (non-persistence), implement Invariant 13 (Topology Backups) and Invariant 14 (Write-File Overwrite Lock) | COMPLETED |
| 1.1-H26 | Implement Persona Store & Entropy Gate — personalities/ directory, default .md files for all 5 roles, .mbo/persona.json schema, ~/.orchestrator/personas/ user library, persona injection into callModel, Operator extraction pass replacing validateOutputSchema() JSON check, Entropy Score computation in Stage 1.5, hard stop at Entropy > 10, agent-onboarding.md Stage 1.5 update, AGENTS.md Section 13 | OPEN — Tier 2, DID required, design in DESIGN_DECISIONS.md DDR-001/002/003/004 |
| 1.1-H27 | Implement Agent Output Streaming (Section 33) — persona-consistent character output, inter-agent conversation visibility, per-agent streaming flags in operator config | OPEN |
| 1.1-H28 | Implement Persistent Operator Window (Section 34) — transition from process-per-task to persistent loop, mbo-start watchdog integration, session history persistence | COMPLETED — 2026-03-13 — Persistent REPL with background pipeline, abort, and status reporting implemented. |
| 1.1-H29 | Implement Context Minimization & Tiered Routing (Section 35) — spec refinement gate, model-specific token budgeting, prompt caching for static governance docs | OPEN |

Audit addendum (2026-03-13):
- Task `1.1-H12` is functionally complete, but its original closing commit (`becf656`) bundled unrelated fixes (`1.1-H19`/`1.1-H20`/`1.1-H21`).
- Canonical H12 evidence files are `AGENTS.md`, `.dev/governance/AGENTS.md`, and `src/templates/AGENTS.md`.
