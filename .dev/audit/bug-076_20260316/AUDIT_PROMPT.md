# Mirror Box Orchestrator — BUG-076 Fix Audit Prompt
## Run ID: bug-076_20260316_[agent]
## Date: 2026-03-16
## Branch under review: fix/bug-076-tamper-detection

---

## YOUR ROLE

You are an adversarial auditor. You are reviewing a targeted bug fix written by Claude Code.
Do not implement code. Produce an audit report only.
Derive findings independently before checking your conclusions against the claimed fix.

---

## WHAT YOU ARE AUDITING

**BUG-076:** `test-tamper-chain.js` tamper detection non-functional for historical events.

**Claimed fix:** `scripts/test-tamper-chain.js` was rewritten to be self-contained.
Instead of copying the live `mirrorbox.db`, it now seeds its own synthetic 5-event hash
chain into a fresh temp DB (`tamper-test.db`) before running tamper scenarios.

**Files changed:**
- `scripts/test-tamper-chain.js` — complete rewrite
- `.dev/governance/BUGS.md` — status updated to RESOLVED

**Files NOT changed (under-test, read-only):**
- `scripts/verify-chain.js` — the chain verifier that tamper detection invokes
- `src/state/event-store.js` — the runtime that produces the real event chain

---

## MANDATORY READS (in order)

1. `scripts/test-tamper-chain.js` — the fix under audit
2. `scripts/verify-chain.js` — the verifier invoked by the test
3. `src/state/event-store.js` — the runtime hash envelope (ground truth)
4. `.dev/governance/BUGS.md` — root cause claim (BUG-076 entry)

---

## AUDIT PROCEDURE

### Phase A — Root Cause Verification

The claimed root cause:
> `test-tamper-chain.js` copied the real `mirrorbox.db` and mutated `seq=2`.
> If the live DB had 0 or 1 events, the `UPDATE WHERE seq = 2` touched 0 rows.
> `verify-chain.js` then reported PASS with no tamper detected.

Before reading the fix, answer from first principles:

1. In the old test, if the DB has exactly 1 event (seq=1 only), what does `UPDATE ... WHERE seq = 2` return? What does `verify-chain.js` report?
2. In the old test, if the DB is empty, what does `verify-chain.js` output and what exit code does it produce?
3. Could false-positive PASS also occur due to the skip guard (`MBO_SKIP_BUG_076`)? Under what conditions would that fire?

State whether the root cause claim is accurate, partially accurate, or incorrect, with reasoning.

---

### Phase B — Fix Correctness

Read `scripts/test-tamper-chain.js` and answer:

#### Finding 1 — Hash envelope fidelity

The test seeds events using a `buildChain()` function that constructs hash envelopes and calls SHA-256.
`verify-chain.js` independently reconstructs the same envelope to verify hashes.

**Critical question:** Does `buildChain()` in the test produce envelopes in exactly the same field order and with exactly the same null-coalescing as `verify-chain.js`?

Compare these field-by-field:
- `test-tamper-chain.js` `buildChain()` envelope construction
- `verify-chain.js` envelope construction (lines ~50-60)

List any field, ordering, or coercion differences. If there are none, state MATCH. If any differ, state MISMATCH and explain the consequence.

Then answer: does the test actually verify `verify-chain.js`'s detection logic, or does it test a synthetic chain that was constructed to match `verify-chain.js` but diverges from `event-store.js`'s real output?

Compare the `buildChain()` envelope against `event-store.js` `append()` envelope (lines ~40-50). List any differences.

State verdict: PASS (fidelity confirmed) or FAIL (envelope mismatch found).

---

#### Finding 2 — Test 1: Payload tamper detection

Test 1 mutates `payload` of seq=2 and expects `verify-chain.js` to exit non-zero.

Read the test and answer:
- Is `result.changes === 0` checked after the UPDATE? If not, can the test silently pass if seq=2 is missing?
- If the check IS present, does it exit with a clear error message?
- Does `verify-chain.js` exit non-zero when it finds a hash mismatch? (Read lines ~99-105.)
- Does the test's `catch` block log a success message? Could the catch fire for reasons other than tamper detection (e.g., DB not found)?

Then run:
```bash
cd /Users/johnserious/MBO
node scripts/test-tamper-chain.js 2>&1
echo "Exit code: $?"
```

Report the exact output and exit code.

State verdict: PASS or FAIL.

---

#### Finding 3 — Test 2: Chain breach detection (partial rehash)

Test 2 recomputes seq=2's hash to match the tampered payload, but leaves seq=3's `prev_hash`
pointing at the old hash — a chain breach that must still be detected.

Read the test and answer:
- Does the envelope used to compute `newHash2` match the envelope used by `verify-chain.js`? (Field order, null coalescion.)
- After the UPDATE, does seq=3's `prev_hash` still point at the original seq=2 hash? Or does the test inadvertently update it?
- Does `verify-chain.js` chain-breach detection (lines ~42-47) fire on this scenario?

State verdict: PASS or FAIL.

---

#### Finding 4 — Cleanup on failure paths

The test creates `tamper-test.db`. If the test exits early (e.g., `result.changes === 0`, or
verify-chain exits 0 when it shouldn't), is the temp DB cleaned up?

Read all early-exit paths and state whether `fs.unlinkSync(tamperDbPath)` is called before
each `process.exit(1)`.

State verdict: PASS (all paths clean up) or FAIL (temp file may be left behind).

---

#### Finding 5 — Independence from live environment

The old test depended on the live DB having ≥2 events. The new test claims to be self-contained.

Answer:
- Does the test read `MBO_PROJECT_ROOT` or `process.cwd()` for anything other than locating the temp DB output directory?
- Could the test fail if `.mbo/` directory doesn't exist?
- Does it depend on any runtime state (event-store singleton, db-manager, etc.)?

State verdict: PASS (fully self-contained) or FAIL (residual environmental dependency).

---

### Phase C — Regression Check

Run the full test suite:
```bash
cd /Users/johnserious/MBO
npm test 2>&1
```

Report:
- Total test count
- Pass/fail counts
- Any new failures introduced by the change

State verdict: PASS (no regressions) or FAIL.

---

### Phase D — Coverage Gap Assessment

The fix makes `test-tamper-chain.js` self-contained and catches two tamper scenarios.
Identify any gaps not covered:

1. **Seq=1 tamper** — does the test verify that tampering the root event (no prev_hash) is also caught?
2. **Anchor tamper** — does `verify-chain.js` detect a tampered `chain_anchors` entry? Does the test exercise this?
3. **Seq gap injection** — inserting an event with seq=7 when max is 5. Does `verify-chain.js` catch this? Does the test exercise it?
4. **Parent_event_id tamper** — mutating `parent_event_id` without touching `hash`. Does the hash recalculation in `verify-chain.js` catch this (since parent_event_id is in the envelope)?

For each: state whether it is a gap, and whether it is P1 (tamper goes undetected) or P2 (test coverage gap only).

---

### Phase E — Go/No-Go Decision

Based solely on your independent findings, return one of:

- `APPROVED` — Fix is correct. BUG-076 can be marked RESOLVED. Branch safe to merge.
- `APPROVED WITH CONDITIONS` — Fix is functional but list specific gaps that must be addressed first (with severity).
- `REJECTED` — Fix does not resolve the root cause or introduces new failure modes. List blocking findings.

---

## DELIVERABLES

Write your output to:
```
/Users/johnserious/MBO/.dev/audit/bug-076_20260316/AUDIT_REPORT.md
```

Structure:
1. Root Cause Assessment (Phase A)
2. Finding 1 — Hash envelope fidelity: verdict + evidence
3. Finding 2 — Payload tamper detection: verdict + evidence + command output
4. Finding 3 — Chain breach detection: verdict + evidence
5. Finding 4 — Cleanup on failure paths: verdict + evidence
6. Finding 5 — Environmental independence: verdict + evidence
7. Regression Check: verdict + test counts
8. Coverage Gap Assessment (numbered, severities)
9. Go/No-Go Decision
10. If not APPROVED: exact unblock conditions

---

## IMPORTANT NOTES

- `verify-chain.js` was NOT modified by this fix. If it has bugs, those are separate from BUG-076 scope — flag as new findings.
- Do not run `mbo setup`, `mbo start`, or any daemon commands. This audit is code-and-test only.
- The branch is `fix/bug-076-tamper-detection`. Check it out before reading files.

---

*This prompt is a DID instrument. Do not share findings with any other agent before completing your report.*
