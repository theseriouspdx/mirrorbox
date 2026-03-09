# BUGS.md
## Mirror Box Orchestrator — Known Issues and Queued Fixes

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred with note. Spec gap → spec updated before fix is written.

---

## Section 1 — P0: Blocking Current Milestone (0.3)

### BUG-023: Redactor callback offset/group1 confusion — live secret in mirrorbox.db
- **Status:** COMPLETED

### BUG-024: Chain hash is SHA-256(payload) only — forgery undetected by both verifiers
- **Status:** COMPLETED


---

## Section 2 — P1: Must Fix Before Milestone 0.3 Complete

### BUG-025: Non-deterministic chain ordering on timestamp collision
- **Status:** COMPLETED

### BUG-026: `recover()` blindly returns last event — no snapshot type guard
- **Status:** COMPLETED

---

## Section 3 — P1: Pre-0.4 Spec Corrections (after 0.3 closes)

### BUG-027: `seq` field in hash envelope not present in Event interface
- **Location:** SPEC.md Section 7 (Event Store) — off-the-shelf audit diff
- **Severity:** P1 — Hash formula is unimplementable as written; blocks BUG-024 fix
- **Description:** The chain-linked hash envelope (proposed in diff, required by BUG-024 fix) includes `seq` in the canonical JSON object, but `seq` does not appear in the Event interface schema. Fix is to add `seq: number` to the interface as a monotonic counter — this also resolves BUG-025 (ordering).
- **Fix required:** Add `seq: number` to Event interface in SPEC.md Section 7. Apply as part of PRE-0.4-01 spec correction task.
- **Status:** OPEN

### BUG-028: MCP server implementation decision unresolved — blocks 0.4A
- **Location:** SPEC.md Section 6 (MCP Server Interface)
- **Severity:** P1 — Blocks 0.4A; no library or framework evaluated for MCP server
- **Description:** Section 6 requires an MCP server exposing five tools. The off-the-shelf audit covered most components but skipped MCP entirely. This is a build-vs-buy decision: `@modelcontextprotocol/sdk` (official TypeScript SDK) vs hand-rolled JSON-RPC vs stdio transport. Must be resolved before 0.4 code starts.
- **Fix required:** Research spike before 0.4 begins. Evaluate options, pick one, document in SPEC.md Section 6. Task: PRE-0.4-02.
- **Status:** OPEN


---

## Section 4 — P2: Deferred

### BUG-009: Graph staleness detection not specified | Milestone: 0.4 | OPEN
### BUG-010: Tiebreaker reviewer block loop undefined | Milestone: 0.7 | OPEN
### BUG-011: HardState truncation priority undefined | Milestone: 0.6 | OPEN
### BUG-012: Smoke test failure loop has no maximum retry count | Milestone: 0.7 | OPEN
### BUG-013: CLI sandbox interaction undefined for terminal context | Milestone: 0.8 | OPEN

---

## Section 5 — Resolved

### Milestone PRE-0.1
- **BUG-001:** Milestone ordering corrected in SPEC.md Appendix A (Operator after Graph).
- **BUG-002:** Sandbox milestone moved before Git/Execution in corrected sequence.
- **BUG-003:** Runtime DID enforcement requirement documented in Section 14 + Section 22.
- **BUG-004:** Tier 0 safelist requirement added to Section 8.
- **BUG-005:** Adversarial review accurately renamed in Appendix C. Peer-DID protocol established in AGENTS.md.
- **BUG-006:** Paraphrase-back validation added to Section 5 onboarding synthesis.
- **BUG-007:** Sandbox execution modes (Mock Mode, Isolated Local Mode) defined in Section 16.
- **BUG-008:** External invariant test suite requirement added to Milestone 1.0.

### Milestone 0.2
- **BUG-014 to BUG-018:** Resolved via adversarial review during 0.2 implementation.
- **BUG-019:** `callModel` Section 10 firewall implemented (`buildFirewalledMessages`, `detectFirewallViolation`).
- **BUG-020:** Timeout handlers added to `callLocalProvider` and `callOpenRouter`.
- **BUG-021:** OpenRouter key sourcing unified through resolved provider config.
- **BUG-022:** Role routing realigned with Section 11 vendor assignments; `findProvider()` helper removed.

### Milestone 0.3
- **BUG-023 to BUG-029:** Radius One audit findings resolved in implementation. Redactor capture groups fixed, Event envelope hash upgraded, `seq` chronological ordering implemented, and `recover()` logic restricted to snapshot events.

---

*Last updated: 2026-03-08*
