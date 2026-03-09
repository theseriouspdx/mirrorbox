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
- Section 7 (`SPEC.md`): Event Store, append-only chain integrity.
- Section 17 (`SPEC.md`): State and recovery behavior.
- Section 22 invariants:
  - Invariant 4: Every operation reproducible from event store.
  - Invariant 8: Secrets never enter persistent state.

### Audit objective
Verify Milestone 0.3 is safe to close and PRE-0.4 spec work can begin.

---

## 2. Finding 1 — Redactor (Invariant 8)

### Static review verdict: **PASS (with caveats)**

Evidence:
- Callback/group capture logic is corrected via variadic args and string type check: `/Users/johnserious/MBO/src/state/redactor.js:34-45`.
- Buffer-encoded values are handled in JSON replacer: `/Users/johnserious/MBO/src/state/redactor.js:21-25`.
- camelCase fields are covered by content-wide regex scanning after object JSON serialization, and generic key matcher includes `apikey`, `secretkey`, `authtoken`, `auth_token`: `/Users/johnserious/MBO/src/state/redactor.js:7`.

### Runtime evidence
- Provided redactor sweep shows object/camelCase/buffer/anthropic/nested cases redacting correctly.
- The one reported failure (`Raw string`) comes from a malformed test command that does not call `redact()` for that case.
- Direct check confirms raw-string redaction works:
  - `node -e "const { redact } = require('./src/state/redactor'); console.log(redact('sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890'));"`
  - Output: `[REDACTED:OpenRouter]`

### Caveat
Pattern coverage remains partial for broader real-world secret families (see Additional Surface Review #1).

---

## 3. Finding 2 — Chain Hash Integrity (Invariant 4)

### Static review verdict: **FAIL**

Evidence:
- Hash envelope includes `parent_event_id`, not parent hash: `/Users/johnserious/MBO/src/state/event-store.js:31-35`.
- This design allows payload tamper + local hash recompute for a historical event without forcing downstream invalidation.

### Runtime evidence
- Baseline verifier reports PASS on production DB (`verify-chain.js` and `verify-chain.py`).
- Tamper proof reproduced successfully:
  - Copied DB to `/tmp/mirrorbox_reaudit_tamper.db`.
  - Modified payload/hash for seq 2 only.
  - Both verifiers still reported PASS.

### Required verdict per prompt
- Tamper detection result: **FAIL (tamper undetected)**.

---

## 4. Finding 3 — Transaction Ordering (Invariant 4)

### Verdict: **FAIL**

Evidence:
- `id` and `timestamp` are assigned before opening transaction: `/Users/johnserious/MBO/src/state/event-store.js:11-12`.
- `seq` is correctly assigned inside transaction from `lastInsertRowid`: `/Users/johnserious/MBO/src/state/event-store.js:29`.

Prompt criteria required all three (`id`, `timestamp`, `seq`) assigned inside transaction; current code does not satisfy that fully.

---

## 5. Finding 4 — Recovery Type Guard (Section 17)

### Verdict: **PASS**

Evidence:
- Recovery query is snapshot-type constrained (`WHERE stage = 'STATE'`): `/Users/johnserious/MBO/src/state/state-manager.js:61`.
- Recovered payload is schema-checked (`currentTask`, `currentStage`): `/Users/johnserious/MBO/src/state/state-manager.js:65-67`.
- No snapshot behavior returns explicit failure object: `/Users/johnserious/MBO/src/state/state-manager.js:63`.
- Runtime check `node scripts/test-recovery.js` passed.

---

## 6. Additional Surface Review

1. **[P1] Chain tamper resistance is insufficient (critical design gap).**
- Location: `/Users/johnserious/MBO/src/state/event-store.js:31-35`, `/Users/johnserious/MBO/scripts/verify-chain.js:41-49`, `/Users/johnserious/MBO/scripts/verify-chain.py:37-45`.
- Both implementation and verifiers validate per-event envelope only; they do not chain hash-to-hash (`prev_hash`) across rows.
- Impact: attacker with write access can alter a non-tail event and recompute only that row hash; chain still passes.

2. **[P1] Event append atomicity risk via two-step insert/update hash write.**
- Location: `/Users/johnserious/MBO/src/state/event-store.js:24-39`.
- Event is inserted with placeholder hash (`'PENDING'`) then updated. Transaction helps, but model assumes no mid-transaction abnormal termination at SQLite layer and no external partial writes.
- More robust pattern: compute all fields first and insert one immutable row.

3. **[P2] JS/Python verifier parity currently aligns, but both share the same structural blind spot.**
- Both scripts check identical fields and anchor tail consistency.
- Agreement observed on baseline and tampered DB (both PASS), confirming parity but also shared vulnerability.

4. **[P2] Schema migration to add `seq` is mostly safe but can reorder historical events under timestamp collisions.**
- Location: `/Users/johnserious/MBO/src/state/db-manager.js:99-101`.
- Migration orders by `timestamp, id`, not original insertion rowid, so old event order can change when timestamps collide.
- This may alter reconstructed historical sequence semantics.

5. **[P2] `test-redactor.js` gives partial confidence; misses key regression surfaces.**
- Location: `/Users/johnserious/MBO/scripts/test-redactor.js`.
- Strengths: raw string with non-zero offset, camelCase object field, nested object.
- Gaps: no direct Buffer test, no Anthropic test, limited adversarial malformed payload coverage.

6. **[P3] Secret pattern coverage is still selective.**
- Location: `/Users/johnserious/MBO/src/state/redactor.js:1-8`.
- Supports OpenRouter, Anthropic, GitHub classic PAT-like prefix, OpenAI old format, Slack token pattern, and generic key-value heuristics.
- Likely misses many modern credential forms (e.g., GitHub fine-grained PAT variants, cloud provider token formats).

---

## 7. Go/No-Go Decision

**NO-GO**

Blocking reasons:
- Chain tamper is not detected (Invariant 4 still not met under adversarial edit model).
- Transaction ordering criteria for `id`/`timestamp` placement (as specified in re-audit prompt) is not fully satisfied.

---

## 8. Unblock Conditions (Exact)

1. Implement true chain-linking by previous hash:
- Store `prev_hash` (or include previous event hash in envelope) when appending.
- Verifiers must recompute and validate both current hash and linkage against prior hash.

2. Assign all event identity/time fields inside the transaction:
- Move `id` and `timestamp` allocation into `db.transaction()` closure.

3. Add regression proof commands:
```bash
cd /Users/johnserious/MBO
node scripts/verify-chain.js
python3 scripts/verify-chain.py

cp data/mirrorbox.db /tmp/mirrorbox_reaudit_tamper2.db
# mutate a non-tail event payload+local hash only
node scripts/verify-chain.js /tmp/mirrorbox_reaudit_tamper2.db && echo "UNEXPECTED PASS" || echo "EXPECTED FAIL"
python3 scripts/verify-chain.py /tmp/mirrorbox_reaudit_tamper2.db
```
Expected: both verifiers fail on tampered DB.


---

## 9. DID Reconciliation Note (post-independent report)

Compared against prior audit: `/Users/johnserious/MBO/.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md`.

### Agreement
- **Finding 2 (Chain Hash Integrity):** Agree on FAIL. Prior audit and this audit both demonstrate tamper-undetected behavior under non-tail event rewrite + local hash recompute.
- **Finding 3 (Transaction Ordering):** Agree on FAIL for strict criterion that all identity/time ordering fields must be assigned in-transaction.
- **Finding 4 (Recovery Type Guard):** Agree on PASS.
- **Overall decision:** Agree on **NO-GO** due to blocking chain integrity issue.

### Divergence
- **Finding 1 (Redactor):**
  - Prior audit: FAIL (reported raw OpenRouter string bypass and object redaction concerns).
  - This audit: PASS (with caveats), based on direct code inspection and direct raw-string invocation check.

### Why the divergence exists
- The provided ad-hoc command in the re-audit prompt labels `Raw string` but passes a literal string directly into output checks without first calling `redact()` for that case. That specific test line can produce a false failure signal.
- Direct invocation (`redact('sk-or-v1-...')`) returns `[REDACTED:OpenRouter]` in current code, and object/buffer/camelCase/Anthropic cases also redact in this re-audit run.

### Final stance after reconciliation
- Divergence on Finding 1 does not change go/no-go outcome.
- Chain integrity remains a blocker; milestone closure should remain **NO-GO** until hash-link design and verifier logic are corrected.
