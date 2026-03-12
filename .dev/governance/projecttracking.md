# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** 1.1 — Portability & Tokenmiser [IN PROGRESS]
**Next Action:** 1.1-H08 — MCP Runtime Contract v3 (99/1 Reliability)

---

## NEXT ACTION

**Task 1.1-H08 — MCP Runtime Contract v3 (99/1 Reliability)**

Goal: Make MCP startup/connect/recovery deterministic under concurrency and crash conditions while preserving governance-safe recovery.

Scope:
1. Add atomic manifest contract (`manifest_version`, `checksum`, `epoch`, `instance_id`).
2. Add MCP-protocol health validation (`initialize` + `graph_server_info`) before trust.
3. Add CAS startup lock to prevent dual-start split-brain.
4. Add process fingerprint validation (pid + start time + command/root).
5. Add restart circuit breaker + explicit incident state (no silent retry loops).
6. Add acceptance tests for concurrency, stale/corrupt state, crash loops, and cross-project isolation.

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
| 1.1-H05 | Implement Authoritative Launch Sequence (Step 1-7) | IN REVIEW |
| 1.1-H06 | Implement Tokenmiser Baseline & Current-Raw scan hooks | COMPLETED |
| 1.1-H07 | Implement TOKEN_USAGE event emission in call-model.js | COMPLETED |
| 1.1-H08 | Implement MCP Runtime Contract v3 (99/1 Reliability) | COMPLETED |
| 1.1-H09 | Implement Tokenmiser Value-Tracking ($chars/4 baseline) | COMPLETED |
| 1.1-H10 | Implement SHIFT+T Stats Overlay & Persistence (.mbo/stats.json) | COMPLETED |
| 1.1-H11 | Implement Agent Header status bar (Green/Red metrics) | COMPLETED |
