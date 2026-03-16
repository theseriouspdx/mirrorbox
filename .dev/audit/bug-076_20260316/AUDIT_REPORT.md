# Mirror Box Orchestrator — BUG-076 Fix Audit Report
## Run ID: bug-076_20260316_gemini
## Date: 2026-03-16
## Branch under review: fix/bug-076-tamper-detection
## Status: APPROVED WITH CONDITIONS

---

## 1. Root Cause Assessment (Phase A)

The root cause claim is **ACCURATE**. 

The previous iteration of `test-tamper-chain.js` depended on the state of the live `mirrorbox.db`. If the database contained fewer than 2 events, the command `UPDATE events SET payload = ... WHERE seq = 2` would silently update 0 rows. Consequently, `verify-chain.js` would run against an untampered database and report `PASS`, leading to a false-positive result in the test suite. 

---

## 2. Finding 1 — Hash envelope fidelity

**Verdict: PASS**

Evidence:
- **Field Order:** `test-tamper-chain.js` uses an object literal for envelope construction that matches the key order in `verify-chain.js` and `src/state/event-store.js` (`id`, `seq`, `stage`, `actor`, `timestamp`, `world_id`, `parent_event_id`, `prev_hash`, `payload`).
- **Null Coalescing:** The test correctly uses `?? null` for `parent_event_id` and `prev_hash`, matching the runtime and verifier logic.
- **Payload Consistency:** The test correctly stringifies the payload before hashing, mimicking the `EventStore.append()` behavior.

The test successfully verifies the actual detection logic of `verify-chain.js` using a high-fidelity synthetic chain.

---

## 3. Finding 2 — Payload tamper detection

**Verdict: PASS**

Evidence:
- The test explicitly checks `result.changes === 0` after the mutation and exits with a clear error if setup fails.
- `verify-chain.js` successfully caught the payload tamper in the audit run (`FAIL [Hash Mismatch]`).
- The `catch` block correctly identifies the non-zero exit code of the verifier as a success for the tamper test.

Command Output:
```
Mutating payload of seq 2...
Running verification on tampered DB (should fail):
...
FAIL [Hash Mismatch]: Event ... (seq 2)
FAILED: 1 integrity error(s) found.
SUCCESS: Verification caught the payload tamper.
```

---

## 4. Finding 3 — Chain breach detection

**Verdict: PASS**

Evidence:
- The test reconstructs the envelope for seq 2 using the tampered payload and correctly computes a new valid hash for that event.
- It updates seq 2's hash but leaves seq 3's `prev_hash` pointing to the old (original) hash of seq 2.
- `verify-chain.js` correctly identified the chain breach (`FAIL [Chain Breach]`).

---

## 5. Finding 4 — Cleanup on failure paths

**Verdict: FAIL**

Evidence:
- **Missing Cleanup Path:** At line 94, if `result.changes === 0`, the test calls `process.exit(1)` without unlinking `tamperDbPath`. This leaves the temporary test database on disk in the `.mbo/` directory.
- Other paths (failure caught by `catch` or full test success) correctly call `fs.unlinkSync(tamperDbPath)`.

---

## 6. Finding 5 — Environmental independence

**Verdict: PASS**

Evidence:
- The test seeds its own database and does not read from `mirrorbox.db`.
- It is fully self-contained regarding event data.
- **Minor Dependency:** The test assumes the `.mbo/` directory exists as a parent for `tamper-test.db`. While this is standard for MBO projects, a completely fresh environment without `.mbo/` would cause the test to fail during database initialization.

---

## 7. Regression Check

**Verdict: PASS**

- **Total test count:** 16
- **Pass/fail counts:** 16 Pass, 0 Fail.
- `test-tamper-chain.js` passed successfully in the sequential runner.

---

## 8. Coverage Gap Assessment

1. **Seq=1 (Root) Tamper [P2]:** The test does not verify if tampering the root event (where `prev_hash` is null) is detected. While hash integrity should catch it, it is a gap in the test coverage.
2. **Anchor Tamper [P2]:** The test does not verify if tampering with the `chain_anchors` table is detected by `verify-chain.js`.
3. **Sequence Gap Injection [P2]:** The test does not verify if inserting a gap in sequences (e.g., seq 1, 2, 4) is detected.
4. **Parent Event ID Tamper [P2]:** While the test uses `parent_event_id` in its re-hashing, it doesn't explicitly test a scenario where only the `parent_event_id` is mutated while the hash is "fixed" to match.

---

## 9. Go/No-Go Decision

**APPROVED WITH CONDITIONS**

The fix successfully resolves BUG-076 by providing a deterministic, self-contained test for tamper detection.

---

## 10. Unblock Conditions

1. **Fix Cleanup:** Add `if (fs.existsSync(tamperDbPath)) fs.unlinkSync(tamperDbPath);` before the `process.exit(1)` at line 94 in `scripts/test-tamper-chain.js`.
2. **Directory Guard (Optional):** Add `fs.mkdirSync(path.dirname(tamperDbPath), { recursive: true });` before initializing the database to ensure environmental independence.
