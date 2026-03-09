# BUGS.md
## Mirror Box Orchestrator — Known Issues and Queued Fixes

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred with note. Spec gap → spec updated before fix is written.

---

## Section 1 — P0: Blocking Current Milestone (0.3)

(None. Milestone 0.3 SUCCESS)

---

## Section 2 — P1: Must Fix Before Milestone 0.3 Complete

### BUG-024: Chain hash is SHA-256(payload) only — forgery undetected by both verifiers
- **Location:** `src/state/event-store.js`
- **Severity:** P1 — Invariant 4 violated in original implementation; now fixed
- **Audit reference:** `.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md` — FINDING-2
- **Status:** COMPLETED — chain-linked hash with seq envelope implemented in event-store.js

### BUG-025: Non-deterministic chain ordering on timestamp collision
- **Location:** `src/state/event-store.js`
- **Severity:** P1 — ordering flaw; now fixed
- **Audit reference:** `.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md` — FINDING-3
- **Status:** COMPLETED — seq assigned via lastInsertRowid inside transaction

### BUG-026: `recover()` blindly returns last event — no snapshot type guard
- **Location:** `src/state/state-manager.js`
- **Severity:** P1 — silent state corruption on recovery; now fixed
- **Audit reference:** `.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md` — FINDING-4
- **Status:** COMPLETED — recover() queries stage='STATE' events with schema validation


### BUG-029: Session 0.4A Audit FAIL (Item 5) — chain_anchors schema mismatch
- **Location:** `src/state/event-store.js` vs `src/state/db-manager.js`
- **Severity:** P1 — write path failure
- **Status:** COMPLETED — run_id, seq, event_id, hash, created_at reconciliation implemented.

### BUG-030: Session 0.4A Audit FAIL (Item 5) — hash envelope mismatch in SPEC.md
- **Location:** `SPEC.md` Section 7
- **Severity:** P1 — spec/implementation drift
- **Status:** COMPLETED — Reconciled to include { id, seq, stage, actor, timestamp, parent_event_id, prev_hash, payload }.

### BUG-031: Session 0.4A Audit WARN (Item 6) — AGENTS.md dev-graph entrypoint missing
- **Location:** `AGENTS.md` Section 11
- **Severity:** P1 (WARN-to-FAIL condition) — missing file reference
- **Status:** COMPLETED — marked as future/unimplemented task.

---

## Section 4 — P2: Deferred

### BUG-009: Graph staleness detection not specified | Milestone: 0.4 | OPEN
### BUG-010: Tiebreaker reviewer block loop undefined | Milestone: 0.7 | OPEN
### BUG-011: HardState truncation priority undefined | Milestone: 0.6 | OPEN
### BUG-012: Smoke test failure loop has no maximum retry count | Milestone: 0.7 | OPEN
### BUG-013: CLI sandbox interaction undefined for terminal context | Milestone: 0.8 | OPEN

### Milestone 0.3
- **BUG-023:** Fixed redactor callback offset/group1 confusion in `redactor.js`. Corrected regex patterns, added Buffer handling, and expanded secret detection.
- **BUG-024:** Upgraded chain-linked hash envelope with `seq` field.
- **BUG-025:** Fixed deterministic ordering via transaction-assigned `seq`.
- **BUG-026:** Added snapshot type guard to `recover()`.
- **BUG-001:** Milestone ordering corrected in SPEC.md Appendix A.
- **BUG-002:** Sandbox milestone moved before Git/Execution.
- **BUG-003:** Runtime DID enforcement documented in Section 14 + Section 22.
- **BUG-004:** Tier 0 safelist requirement added to Section 8.
- **BUG-005:** Adversarial review renamed in Appendix C. Peer-DID protocol established.
- **BUG-006:** Paraphrase-back validation added to Section 5.
- **BUG-007:** Sandbox execution modes defined in Section 16.
- **BUG-008:** External invariant test suite requirement added to Milestone 1.0.

### Milestone 0.2
- **BUG-014 to BUG-018:** Resolved via adversarial review during 0.2 implementation.
- **BUG-019:** `callModel` Section 10 firewall implemented.
- **BUG-020:** Timeout handlers added to HTTP providers.
- **BUG-021:** OpenRouter key sourcing unified.
- **BUG-022:** Role routing realigned with Section 11.

---

*Last updated: 2026-03-08*
