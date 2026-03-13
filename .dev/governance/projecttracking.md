# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** 1.1 — Portability & Tokenmiser [IN PROGRESS]
**Next Action:** Temporary MCP-disabled operations mode active (2026-03-13) — execute legacy workflow while MCP redesign requirements are finalized

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
| 1.1-H13 | Directory structure cleanup — move root strays to scripts/, delete scratch files, update .gitignore | OPEN |
| 1.1-H14 | Multi-agent dev workflow design — role assignments for Claude/Gemini/Codex/Claude Desktop, DID protocol across tools, handoff format | OPEN |
| 1.1-H15 | Fix BUG-057: MCP stream-destroyed incident — safeHandleTransportRequest + SSE guard + autoRefreshDevIfStale queue serialization | COMPLETED |
| 1.1-H16 | Fix BUG-061: Merkle scope drift + MCP query path drift (manifest-only endpoint + canonical root assertion + preflight command hardening) | COMPLETED |
| 1.1-H17 | Fix BUG-062: In-app human-mediated auth flow (no CLI dependency) + self-run/non-TTY auth usability | COMPLETED |
| 1.1-H18 | Fix BUG-064: mcp_query initialize timeout via wrong endpoint selection and weak fallback | COMPLETED |
| 1.1-H19 | Fix BUG-065: preserve dynamic env endpoint + POST preflight to avoid TCP-only MCP hangs | COMPLETED |
| 1.1-H20 | Fix BUG-066: always route initialize to fresh transport instance in MCP server | IN PROGRESS |
| 1.1-H21 | Fix BUG-067: keep `mbo auth` usable in controller repo while runtime remains guarded | COMPLETED |
| 1.1-H22 | Temporary MCP-disabled operations mode in controller repo; route agents to legacy workflow | ACTIVE TEMPORARY OVERRIDE |
