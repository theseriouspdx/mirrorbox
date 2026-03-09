# Mirror Box Orchestrator — Milestone 0.3 Re-Audit (Codex)

## 1. Scope Lock

### Files under review
- `/Users/johnserious/MBO/src/state/redactor.js`
- `/Users/johnserious/MBO/src/state/event-store.js`
- `/Users/johnserious/MBO/src/state/state-manager.js`
- `/Users/johnserious/MBO/src/state/db-manager.js`
- `/Users/johnserious/MBO/scripts/verify-chain.js`
- `/Users/johnserious/MBO/scripts/verify-chain.py`
- `/Users/johnserious/MBO/scripts/test-redactor.js`
- `/Users/johnserious/MBO/scripts/test-state.js`
- `/Users/johnserious/MBO/scripts/test-recovery.js`

### Invariants under test
- `SPEC.md` Section 7 (Event Store)
- `SPEC.md` Section 17 (State and Observability)
- `SPEC.md` Section 22 Invariant 4 (reproducibility from event store)
- `SPEC.md` Section 22 Invariant 8 (secrets not persisted)

### Audit objective
Verify Milestone 0.3 is safe to close and PRE-0.4 spec work can begin.

---

## 2. Finding 1 — Redactor: verdict + evidence

### Static review
- Zero-capture-group callback handling is corrected using `(...args)` and type checking (`src/state/redactor.js:34-45`).
- `group1`/offset confusion is resolved by only treating `args[0]` as capture when it is a string (`src/state/redactor.js:39-43`).
- Buffer handling exists via JSON replacer (`src/state/redactor.js:22-25`).
- camelCase object fields are covered by full-content regex scan post-stringify.

### Runtime
- Prompt-provided command reports one FAIL for `Raw string`, but that case is malformed (it does not call `redact`).
- `scripts/test-redactor.js` passes all probes, including raw string, camelCase, buffer, and Anthropic cases.

### Verdict
**PASS**

---

## 3. Finding 2 — Chain Hash: verdict + evidence

### Static review
- Hash envelope includes `parent_event_id` and `prev_hash` (`src/state/event-store.js:29-38`).
- Chain linkage now includes previous hash; downstream hash relationship is enforced by verifier chain checks.
- `seq` is assigned inside transaction (`src/state/event-store.js:26`).

### Runtime
- Baseline: both verifiers PASS on current DB.
- Tamper test: modify event payload and recompute only that row hash. Both verifiers FAIL due `prev_hash` breach at next row.

### Verdict
**PASS (tamper detected)**

---

## 4. Finding 3 — Transaction Ordering: verdict + evidence

### Checks
- `id` inside transaction: yes (`src/state/event-store.js:19`).
- `timestamp` inside transaction: yes (`src/state/event-store.js:20`).
- `seq` inside transaction: yes (`src/state/event-store.js:26`).
- `seq` from `lastInsertRowid`: no; current code computes `seq = lastEvent.seq + 1` before insert (`src/state/event-store.js:23-27`).

### Verdict
**FAIL (strict prompt criterion not fully met)**

---

## 5. Finding 4 — Recovery Type Guard: verdict + evidence

### Static review
- Recovery filters snapshot stage explicitly: `WHERE stage = 'STATE'` (`src/state/state-manager.js:61`).
- Recovered payload schema validated for `currentTask` and `currentStage` (`src/state/state-manager.js:65-67`).
- No snapshot returns explicit failure object `{ ok: false, reason: 'no_snapshot' }` (`src/state/state-manager.js:63`).

### Runtime
- `node scripts/test-recovery.js` passes.

### Verdict
**PASS**

---

## 6. Additional Surface Review Findings

1. **[P1] Migration path can fail for legacy `events` tables missing `seq`.**
- `db-manager.js` migration branch triggers on `!hasPrevHash` and then executes `ORDER BY seq ASC` while copying rows (`src/state/db-manager.js:85-107`).
- If a pre-`seq` table exists, this query references a non-existent column and migration will fail.

2. **[P2] JS/Python verifier parity is good and behavior matches.**
- Both scripts now validate `prev_hash` linkage, envelope hash, sequence continuity, parent linkage, and anchor.
- Both PASS baseline and FAIL tampered DB consistently.

3. **[P2] Secret coverage improved but still not exhaustive.**
- Anthropic (`sk-ant-api03-*`) supported.
- Potential misses remain for newer vendor token formats not represented in patterns (e.g., some provider-specific modern key variants).

4. **[P3] Prompt-provided redactor command has a false-negative first case.**
- `Raw string` case does not call `redact`, so it is not a valid redaction assertion.

5. **[P3] Event append atomicity issue from INSERT→UPDATE split appears resolved.**
- Current append computes hash first and performs a single immutable insert (`src/state/event-store.js:28-45`).

---

## 7. Go/No-Go Decision

**GO WITH CONDITIONS**

Core security regressions from prior audit (secret leakage and undetected chain tamper) are not reproduced. However, two conditions remain before full clean closure:
- Finding 3 strict criterion mismatch (`seq` not sourced from `lastInsertRowid`).
- Migration safety bug for legacy no-`seq` schema.

---

## 8. Exact Unblock Conditions + Verification Commands

1. Fix migration branch to support both old schemas:
- If `seq` missing: migrate using deterministic order that does not reference missing columns (e.g., `timestamp, id` for old schema) or conditional SQL path.
- If `seq` exists and `prev_hash` missing: preserve `seq` ordering.

2. Resolve transaction ordering criterion explicitly:
- Either switch to `lastInsertRowid` flow while preserving immutable hash correctness, or document/verify why `lastEvent.seq + 1` is the accepted contract and add concurrency-safe guard/retry behavior.

3. Verification commands:
```bash
cd /Users/johnserious/MBO
node scripts/test-redactor.js
node scripts/test-recovery.js
node scripts/verify-chain.js
python3 scripts/verify-chain.py
node scripts/test-state.js

cp data/mirrorbox.db /tmp/mirrorbox_reaudit_tamper3.db
# mutate event payload + recompute only tampered row hash
node scripts/verify-chain.js /tmp/mirrorbox_reaudit_tamper3.db && echo "UNEXPECTED PASS" || echo "EXPECTED FAIL"
python3 scripts/verify-chain.py /tmp/mirrorbox_reaudit_tamper3.db
```
Expected: both verifiers fail on tampered DB.


---

## 9. DID Reconciliation Note (post-independent report)

Reference compared after report creation:
- `/Users/johnserious/MBO/.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md`

### Agreement
- Prior root issues (redactor callback bug and missing hash chaining) are valid for the historical code snapshot described in the prior report.
- Recovery guard direction is correct: snapshot-stage filtering and schema guard are necessary.

### Divergence
- **Current re-audit verdict differs from prior overall `AUDIT_FAIL`.**
  - I find redactor currently **PASS** (with pattern-coverage caveat), not FAIL.
  - I find chain tamper detection currently **PASS** (tamper is now detected via `prev_hash` linkage), not FAIL.
  - I rate overall as **GO WITH CONDITIONS**, not NO-GO/AUDIT_FAIL.

### Why divergence is justified
- The code and verifier surfaces in this workspace have materially changed since the prior report:
  - Event envelope now includes `prev_hash`, and both verifiers explicitly validate chain continuity on `prev_hash`.
  - Event append now inserts immutable final hash in one write.
  - Redactor callback uses variadic args with capture-type discrimination, eliminating the offset/capture confusion.
- Reproduced tamper attempt (single-row payload/hash rewrite) is rejected by both JS and Python verifiers in current state.

### Remaining risk acknowledged
- A migration bug exists for legacy schemas missing `seq` (query references `ORDER BY seq`), and strict transaction-ordering criterion about `lastInsertRowid` is not fully aligned with prompt wording.
- These are why final verdict remains `GO WITH CONDITIONS` rather than unconditional `GO`.
