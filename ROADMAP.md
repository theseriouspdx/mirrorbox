# Mirror Box Orchestrator — Roadmap

## Phase 1 — Foundations [COMPLETED]

Phase 1 is human-built. Claude Code and Gemini CLI operate under the DID protocol. Every task is tracked in `projecttracking.md`. No code gets written without a task entry and human approval. The goal is a system that can run a real task on an external codebase end-to-end.

### Milestone 0.1–0.11 — [COMPLETED]
- [x] All Phase 1 milestones completed 2026-03-10.
- [x] Intelligence Graph, Sandbox, DID Pipeline, Git/Promotion all operational.

---

## Phase 2 — Sovereign Factory [IN PROGRESS]

Milestone 1.0 is a threshold, not a feature. The system runs its first task on its own codebase. This is the moment Claude Code and Gemini CLI step back.

### Milestone 1.0 — Production Alpha [IN PROGRESS]
- [x] Orchestrator runs its first task on its own codebase.
- [ ] **Sovereign Loop (1.0-09)**: MBO patches its own `src/index.js` and promotes to `MBO_Alpha`.
- [x] **Assumption Ledger (1.0-10)**: Section 27 protocol implemented and enforced.
- [x] **Relay & Telemetry**: Real-time event streaming and UDS telemetry operational.
- [x] External Invariant Test Suite verified (Section 22).

---

## Phase 3 — Expansion (Milestone 1.1+)

Milestone 1.1 focuses on expanding the Sovereign Loop's reach and hardening the system's resilience for multi-user production environments.

### Milestone 1.1 — Portability & Hardening [IN PROGRESS]
- [x] Section 28 portability/scaffolding/launch sequence hardening completed (`1.1-H01` to `1.1-H05`).
- [x] Master Test Suite Hardening (Rules 1/5) completed (v0.11.186).
- [x] Tokenmiser baseline/accounting/dashboard completed (`1.1-H06` to `1.1-H11`).
- [x] MCP daemon migration completed (`1.1-H23`) and DID protocol implementation completed (`1.1-H24`).
- [x] Security hardening completed for affirmation + topology backups + overwrite lock (`1.1-H25`).
- [ ] Directory structure cleanup (`1.1-H13`) remains open.
- [ ] Persona Store & Entropy Gate (`1.1-H26`) remains open.
- [ ] Agent Output Streaming / Section 33 (`1.1-H27`) remains open.
- [x] Persistent Operator Window / Section 34 (`1.1-H28`) completed.
- [ ] Context Minimization & Tiered Routing / Section 35 (`1.1-H29`) remains open.

### Milestone 1.2 — TUI Stability & Economics
- [ ] Implement Independent Panel Gating for reliable layout math.
- [ ] Implement Budget-Based Model Routing (The Economic Governor).
- [ ] **Cross-Agent Cost Comparison (The Value Proof):** Per-task cost rollup by model tier — Flash tokens × Flash rate + Pro tokens × Pro rate + Sonnet tokens × Sonnet rate vs equivalent single-model cost. Surfaces routing savings as a first-class metric in `getStatus()` and the stats dashboard. Enables empirical comparison of MBO vs direct agent invocation for the same task. Data already exists in `token_log` (model + cost_usd per call, tied to run_id) — missing piece is the rollup query, counterfactual calculation, and dashboard surface. See BUG-150 for tool context token tracking prerequisite.

---

## The 11-Stage Pipeline (Current Implementation)

Stage 1    — Request Classification
Stage 1.5  — Assumption Ledger (Pre-Execution Uncertainty Audit)
Stage 2    — Architecture Query (Intelligence Graph)
Stage 3A   — Independent Plan Derivation (Architecture Planner)
Stage 3B   — Independent Plan Derivation (Component Planner)
Stage 3C   — Gate 1: Plan Consensus
Stage 3D   — Tiebreaker: Plan (fires after consensus failure)
Stage 4A   — Independent Code Derivation (Architecture Planner)
Stage 4B   — Independent Code Derivation (Adversarial Reviewer, blind)
Stage 4C   — Gate 2: Code Consensus
Stage 4D   — Tiebreaker: Code (fires after 3 block verdicts)
Stage 4.5  — Virtual Dry Run (Pre-Flight Sandbox)
Stage 5    — Human Approval Gate (requires "go")
Stage 6    — Patch Generation
Stage 7    — Structural Verification
Stage 8    — Runtime Verification
Stage 10   — Smoke Test
Stage 11   — Knowledge Update (Intelligence Graph refresh)

No code reaches the repository without passing through this sequence and a human typing `go` at Stage 5.

---

*Last updated: 2026-03-13*
