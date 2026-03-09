# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Written:** 2026-03-08  
**Hard State Anchor:** 57  
**Milestone 0.3:** SUCCESS (DID reconciliation complete)

---

## NEXT ACTION

**PRE-0.4-01** — Apply off-the-shelf audit diff to SPEC.md

Changes required:
1. Add `seq: number` to Event interface in Section 7 (BUG-027)
2. Add `prev_hash: string | null` to Event interface in Section 7
3. Document `chain_anchors` table in Section 7 SQLite schema
4. Split Milestone 0.4 into 0.4A (Tree-sitter skeleton) and 0.4B (LSP enrichment) in Appendix A
5. Add redaction note to Section 10 (secrets must be redacted before event store write)
6. Add callModel schema validation as step 4 in Section 10 enforcement list

After PRE-0.4-01: run **PRE-0.4-02** (MCP server research spike).

---

## OPEN VERIFICATION TASK

Before the audit folder is fully closed, the coding agent must run the tamper proof against
the current DB. This is a verification run, not a code change:

```bash
cd /Users/johnserious/mbo
node scripts/verify-chain.js
python3 scripts/verify-chain.py

cp data/mirrorbox.db /tmp/test_tamper_final.db
# tamper seq 2 payload+hash in sqlite3
node scripts/verify-chain.js /tmp/test_tamper_final.db   # must FAIL
python3 scripts/verify-chain.py /tmp/test_tamper_final.db  # must FAIL
```

Both verifiers must exit non-zero on tampered DB. Record output in `.dev/audit/`.

---

## OPEN CODE TASK

**Write test-redactor-v2.js** (scripts/test-redactor-v2.js) and retire test-redactor.js.

Codex referenced this file but it does not exist. The old test-redactor.js has known gaps
(no Buffer, no Anthropic coverage; was written to pass against broken code).

Required coverage for v2:
- Raw OpenRouter string
- Raw Anthropic string (sk-ant-api03-*)
- Object camelCase apiKey
- Object secretKey
- Buffer-encoded key
- Nested object
- Multiple secrets in one string
- Clean object (must pass through unchanged)
- String at position 0 (regression for original offset bug)

Once v2 passes all cases: delete test-redactor.js.

---

## MILESTONE STATUS

| Milestone | Status |
|-----------|--------|
| PRE-0.1 | COMPLETED |
| 0.1 | COMPLETED |
| 0.2 | COMPLETED |
| 0.3 | SUCCESS |
| PRE-0.4 | IN PROGRESS (PRE-0.4-01, PRE-0.4-02 OPEN) |
| 0.4+ | NOT STARTED |

---

## KEY AWARENESS

- `bypass_proofs.js` is a proof-of-failure tool. `[UNEXPECTED]` output means the fix is
  working. Do not misread as failure.
- `test-redactor.js` is deprecated — do not add to it or cite it as coverage evidence.
- Keys were rotated (2026-03-08). Do not query ~/.zshrc for key values.
- DID reconciliation: `.dev/audit/DID_RECONCILIATION.md`
