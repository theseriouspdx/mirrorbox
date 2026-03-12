# Mirror Box Orchestrator — Roadmap

## Phase 1 — Foundations [COMPLETED]

Phase 1 is human-built. Claude Code and Gemini CLI operate under the DID protocol. Every task is tracked in `projecttracking.md`. No code gets written without a task entry and human approval. The goal is a system that can run a real task on an external codebase end-to-end.

### Milestone 0.1–0.11 — [COMPLETED]
- [x] All Phase 1 milestones completed 2026-03-10.
- [x] Intelligence Graph, Sandbox, DID Pipeline, Git/Promotion all operational.

---

## Phase 2 — Sovereign Factory [COMPLETED]

Milestone 1.0 is a threshold, not a feature. The system runs its first task on its own codebase. This is the moment Claude Code and Gemini CLI step back.

### Milestone 1.0 — Production Alpha [COMPLETED]
- [x] Orchestrator runs its first task on its own codebase.
- [x] **Sovereign Loop (1.0-09)**: MBO patches its own `src/index.js` and promotes to `MBO_Alpha`.
- [x] **Assumption Ledger (1.0-10)**: Section 27 protocol implemented and enforced.
- [x] **Relay & Telemetry**: Real-time event streaming and UDS telemetry operational.
- [x] External Invariant Test Suite verified (Section 22).

---

## Phase 3 — Expansion (Milestone 1.1+)

Milestone 1.1 focuses on expanding the Sovereign Loop's reach and hardening the system's resilience for multi-user production environments.

### Milestone 1.1 — Portability & Hardening [IN PROGRESS]
- [ ] Implement Section 28v2 CLI Portability (upward root resolution).
- [ ] Implement Project Scaffolding (.mbo/ init) and .gitignore automation.
- [ ] Implement Tokenizer Baseline and real-time TOKEN_USAGE accounting.
- [ ] Implement Authoritative Launch Sequence with Non-TTY CI guards.
- [ ] Fix BUG-050: Recursive self-correction on validator failure.

### Milestone 1.2 — TUI Stability & Economics
- [ ] Implement Independent Panel Gating for reliable layout math.
- [ ] Implement Budget-Based Model Routing (The Economic Governor).

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

*Last updated: 2026-03-11*
