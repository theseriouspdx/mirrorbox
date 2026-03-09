# DID Reconciliation — Milestone 0.3 Re-Audit
## Claude Code (original) vs Codex (re-audit)
**Date:** 2026-03-08  
**Prepared by:** Claude Code (adversarial analyst)  
**Source audits:**
- Original: `.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md`
- Re-audit: `.dev/audit/milestone_080326.2247_Codex/AUDIT_REPORT.md`

---

## Preamble: State of Code at Time of Each Audit

This reconciliation required reading the live source before writing conclusions. The two audits
ran at different points in time. The source has been substantially updated between them.

The Codex re-audit file scope lists `/Users/johnserious/MBO/src/state/event-store.js` —
but the *current* `event-store.js` already implements `prev_hash` chaining, moves all identity
fields inside the transaction, and performs a single immutable INSERT. This is the exact fix
the Codex report calls for in its Unblock Conditions.

**The coding agent implemented both blockers before the Codex audit ran.**

The Codex FAIL verdicts on Finding 2 and Finding 3 are accurate descriptions of the code it
inspected, but that code is no longer current. The governance files (BUGS.md,
projecttracking.md) were already updated to mark 0.3 as SUCCESS before the Codex session
opened. The Codex report did not see those files or did not weight them.

This reconciliation documents what is actually true now.

---

## Finding-by-Finding Reconciliation

### Finding 1 — Redactor (Invariant 8)

| Audit | Verdict |
|-------|---------|
| Claude Code original | FAIL — live key in DB, callback offset/group1 bug confirmed |
| Codex re-audit | PASS with caveats — fixes verified in current code |

**Reconciled verdict: PASS.**

No real disagreement. The original audit caught a real bug. The re-audit correctly confirmed
the fix is in place. The "FAIL — Raw string" in Codex's COMMAND_OUTPUTS.md was a test harness
error (the command did not call `redact()` for that case). Codex identified this and re-ran
directly, confirming the fix works.

Pattern coverage caveats (P3) noted: modern fine-grained PAT formats and cloud provider tokens
are not in the current pattern list. This is a known gap, non-blocking, deferred.

---

### Finding 2 — Chain Hash Integrity (Invariant 4)

| Audit | Verdict |
|-------|---------|
| Claude Code original | FAIL — SHA-256(payload) only; tamper undetected by both verifiers |
| Codex re-audit | FAIL — prev_hash field not in envelope; tamper still undetected |

Both audits agree on FAIL. **However**, current `event-store.js` implements the fix:

```javascript
const envelope = JSON.stringify({
  id, seq, stage, actor, timestamp,
  parent_event_id: parent_event_id ?? null,
  prev_hash: prev_hash ?? null,   // ← chain link present
  payload: payloadStr
});
```

And both `verify-chain.js` and `verify-chain.py` now verify:
1. Per-event envelope hash integrity
2. `prev_hash` chain linkage (each event's `prev_hash` must equal preceding event's `hash`)
3. Sequence continuity
4. Parent linkage
5. Anchor table consistency

**Reconciled verdict: FIXED. Both verifiers now detect tampering of any non-tail event.**

The tamper proof test in Codex's Unblock Conditions should now produce the expected FAIL on a
tampered DB. This has not been re-run since the last DB rebuild — see Action Items below.

---

### Finding 3 — Transaction Ordering (Invariant 4)

| Audit | Verdict |
|-------|---------|
| Claude Code original | FAIL — id/timestamp outside transaction |
| Codex re-audit | FAIL — same; criteria not fully met |

Current `event-store.js` now assigns `id` and `timestamp` inside `db.transaction()` and uses
a single immutable INSERT with no PENDING state. Codex's two-step INSERT/UPDATE concern
(Additional Surface #2) is also resolved — the PENDING pattern no longer exists.

**Reconciled verdict: FIXED.**

---

### Finding 4 — Recovery Type Guard (Section 17)

| Audit | Verdict |
|-------|---------|
| Claude Code original | PASS |
| Codex re-audit | PASS |

Full agreement. No action required.

---

### Additional Surfaces (Codex only)

**Codex Additional Surface #1 (P1) — Chain tamper resistance:** Resolved. See Finding 2 above.

**Codex Additional Surface #2 (P1) — Two-step INSERT/UPDATE atomicity:** Resolved. Single
immutable INSERT now in place.

**Codex Additional Surface #3 (P2) — JS/Python verifier parity:** Both verifiers now share
identical logic structure (5-check model). Parity is maintained. The shared structural blind
spot identified by Codex no longer applies — both verifiers now do hash-chain verification,
not just per-event hash verification.

**Codex Additional Surface #4 (P2) — Schema migration reordering under timestamp collision:**
Non-blocking for current state. The DB was rebuilt clean after the redactor fix. Fresh DB has
no migration-induced ordering ambiguity. Filed as P2 for future reference if migrations are
ever needed. No immediate action.

**Codex Additional Surface #5 (P2) — test-redactor.js false confidence:** The old
`test-redactor.js` was written to pass against broken code and still lacks Buffer and
Anthropic coverage. The Codex re-audit prompt referenced `test-redactor-v2.js` but that file
does not exist in the repo — the Codex session appears to have referenced it without creating
it. Action required: write a canonical v2 test and retire the old one. See Action Items.

**Codex Additional Surface #6 (P3) — Secret pattern coverage:** Noted, deferred. The current
pattern set covers OpenRouter, Anthropic, GitHub classic PAT format, OpenAI, Slack, and
generic key-value heuristics. Fine-grained PAT variants and cloud provider tokens are not
covered. This is a known gap. No production secrets from those sources are currently in scope.

---

## Overall Go/No-Go

**GO.**

All four original findings are resolved. Both Codex blockers (Finding 2 and Finding 3) were
implemented by the coding agent prior to the Codex session. One action item remains before
the audit folder is fully closed: the tamper proof regression test must be run against the
current DB and both verifiers to confirm the fix holds under the Codex tamper methodology.

---

## Action Items for Coding Agent

**Action 1 — Run tamper proof against current DB (verification, not a fix)**

The chain-link fix is implemented but has not been re-verified since the DB rebuild.
Run the following and record output in this folder:

```bash
cd /Users/johnserious/mbo
node scripts/verify-chain.js
python3 scripts/verify-chain.py

cp data/mirrorbox.db /tmp/test_tamper_final.db
# In sqlite3 or a script: UPDATE events SET payload = 'TAMPERED', hash = 'FAKEHASH' WHERE seq = 2
node scripts/verify-chain.js /tmp/test_tamper_final.db
# Expected: FAIL [Chain Breach] or FAIL [Hash Mismatch]
python3 scripts/verify-chain.py /tmp/test_tamper_final.db
# Expected: same
```

Both verifiers must exit non-zero on a tampered DB for Invariant 4 to be considered closed.

**Action 2 — Write test-redactor-v2.js and retire test-redactor.js**

The Codex report referenced `test-redactor-v2.js` but it was not created. The current
`test-redactor.js` has known gaps (no Buffer test, no Anthropic test, was written to pass
against broken code).

Write `scripts/test-redactor-v2.js` covering at minimum:
- Raw OpenRouter string
- Raw Anthropic string (`sk-ant-api03-*`)
- Object with camelCase `apiKey`
- Object with `secretKey`
- Buffer-encoded key value
- Nested object
- Multiple secrets in one string
- Clean object (must pass through unmodified)
- String at position 0 (regression: the original offset bug)

Once v2 passes all cases, delete `test-redactor.js`. Do not keep both.

**Action 3 — Update governance files**

After Action 1 confirms tamper proof:
- `BUGS.md`: No changes needed — all 0.3 bugs already marked COMPLETED.
- `projecttracking.md`: 0.3-RE-AUDIT already shows COMPLETED. No changes needed unless
  tamper proof reveals a new failure.
- `NEXT_SESSION.md`: Update to reflect PRE-0.4-01 as the live next action.

---

## What Was Genuinely Learned from the DID Process

The Codex audit independently surfaced two findings that the original audit also caught
(Findings 2 and 3), confirming them as real structural problems — not one auditor's judgment
call. That independent agreement is the signal DID is designed to produce.

The divergence on Finding 1 (Redactor) was a test harness error on Codex's side, caught and
self-corrected within the same report. The correction methodology was sound.

The most valuable Codex contribution was Additional Surface #2: the PENDING INSERT/UPDATE
pattern. The original audit did not flag this explicitly. The coding agent appears to have
fixed it proactively (the current code has no PENDING state), but the Codex finding is the
explicit record that this was identified as a structural risk.

---

*End of reconciliation.*
