# BUGS.md
## Mirror Box Orchestrator — Known Issues and Queued Fixes

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred with note. Spec gap → spec updated before fix is written.

---

## Section 1 — P0: Blocking Current Milestone

### BUG-001: Operator milestone precedes Intelligence Graph milestone
- **Location:** Appendix A, Milestone 0.3 (Operator) vs Milestone 0.4 (Intelligence Graph)
- **Severity:** P0 — Milestone ordering is wrong
- **Description:** The Operator's Tier 0 classification requires graph blast-radius queries. Building the Operator before the Intelligence Graph means the Operator can only classify by pattern-matching on request text — which the spec explicitly forbids for Tier 0 determination. Tier 0 is only valid when the graph explicitly confirms zero blast radius.
- **Fix required:** Intelligence Graph must be built before or simultaneously with Operator routing logic. Milestone ordering must be corrected in spec.
- **Status:** OPEN

### BUG-002: Sandbox milestone placed after Git/Execution milestone
- **Location:** Appendix A, Milestone 0.7 (Execution and Git) vs Milestone 0.8 (Sandbox)
- **Severity:** P0 — Inverts the safety model
- **Description:** The spec places Git patch application before the pre-approval sandbox. Stage 7/8 rollback is a recovery mechanism, not a prevention mechanism. Principle 5 requires prevention, not just recovery.
- **Fix required:** Sandbox must be proven before any real-codebase execution. Sandbox milestone must precede Git/Execution milestone.
- **Status:** OPEN

### BUG-003: TypeScript type boundary claimed as runtime DID enforcement
- **Location:** Section 14 (Context Isolation Rules), Section 22 (Invariant 7)
- **Severity:** P0 — Security invariant is false at runtime
- **Description:** TypeScript types are erased at runtime. A developer spreading a larger context object into ReviewerInput silently defeats DID. The system would believe it has high-confidence independent agreement when the reviewer has seen the planner's work.
- **Fix required:** Runtime enforcement must be built — content-hash scanning of assembled reviewer prompt against planner outputs, or process isolation with zero shared memory.
- **Status:** OPEN

### BUG-004: Tier 0 auto-routing on static analysis alone is a security hole
- **Location:** Section 8 (Routing Tiers — Tier 0)
- **Severity:** P0 — Bypasses all safety gates on false confidence
- **Description:** Static analysis cannot confirm zero blast radius for dynamic languages. Dynamic imports, dependency injection, and runtime-resolved call paths are invisible. New files return empty graph queries, which could be interpreted as zero blast radius.
- **Fix required:** Tier 0 requires graph confirmation AND explicit user-approved safelist. New files always Tier 1 minimum.
- **Status:** OPEN

---

## Section 2 — P1: Must Fix Before Milestone Complete

### BUG-005: Appendix C development protocol mislabeled as DID
- **Location:** Appendix C (Agentic Development Protocol)
- **Severity:** P1 — False confidence in Phase 1 quality guarantees
- **Description:** Claude Code proposing + Gemini reviewing the diff blind is adversarial review, not DID. DID requires both agents to independently derive an implementation.
- **Fix required:** Rename the process accurately in Appendix C. Document what guarantees adversarial review provides vs. DID.
- **Status:** OPEN

### BUG-006: Prime directive confirmation insufficient
- **Location:** Section 5 (Onboarding — Phase 4 Synthesis)
- **Severity:** P1 — LLM-synthesized load-bearing constraint with inadequate validation
- **Description:** "Do you agree?" is insufficient. Humans defer to authority. The prime directive is injected into every model call — a hallucinated directive is a systematic bias.
- **Fix required:** Paraphrase-back validation. Ask user to describe in their own words what the prime directive means. If paraphrase diverges, revise before committing.
- **Status:** OPEN

### BUG-007: Sandbox secrets paradox unresolved
- **Location:** Section 16 (Sandbox Environment), Stage 4.5 (Virtual Dry Run)
- **Severity:** P1 — Sandbox non-functional for majority of real applications
- **Description:** "No secrets in sandbox" means most real apps won't boot. A sandbox showing a blank screen cannot serve as interactive pre-approval validation.
- **Fix required:** Define Mock Mode and Isolated Local Mode (.env.sandbox). Validation report must declare what was untestable.
- **Status:** OPEN

### BUG-008: Self-referential transition has no invariant verification methodology
- **Location:** Appendix A (Milestone 1.0), Appendix C
- **Severity:** P1 — Transition criteria named but not operationalized
- **Description:** "All seven security invariants verified" with no methodology. If MBO's DID mechanism is degraded when it begins developing itself, the degraded mechanism evaluates its own changes.
- **Fix required:** External invariant test suite that tests MBO from outside, not using MBO itself. Must run before every `go` during self-referential development.
- **Status:** OPEN

---

## Section 3 — P2: Deferred

### BUG-009: Graph staleness detection not specified | Milestone: 0.4 | OPEN
### BUG-010: Tiebreaker reviewer block loop undefined | Milestone: 0.7 | OPEN
### BUG-011: HardState truncation priority undefined | Milestone: 0.6 | OPEN
### BUG-012: Smoke test failure loop has no maximum retry count | Milestone: 0.7 | OPEN
- **BUG-014 to BUG-018:** Resolved via adversarial review and implementation fixes (Milestone 0.2).

---

## Section 4 — Resolved

- **BUG-001 to BUG-008:** Spec corrections and structural invariants addressed in `SPEC.md`. Completed Milestone PRE-0.1.
- **BUG-005 (Re-evaluated):** Peer-DID protocol established as Phase 1 standard in `AGENTS.md` and `SPEC.md`. Interchangeable roles confirmed.

---

*Last updated: 2026-03-08*
