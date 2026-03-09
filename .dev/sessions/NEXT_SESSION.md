# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Written:** 2026-03-08
**Hard State Anchor:** 432
**Milestone PRE-0.4:** CLOSED ✅
**Milestone 0.4A:** IN PROGRESS

---

## NEXT ACTION

**0.4A-03** — Basic query capability: what calls X, what does X import
- `GraphStore` methods exist (`getCallers`, `getDependencies`, `getImpact`)
- Need integration test against real scan output
- `GraphQueryResult` format (Section 13) must be verified — task 0.4A-04

---

## OPEN VERIFICATION TASK (carried from previous session)

Before the 0.3 audit folder is fully closed, run tamper-proof against current DB:

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

## OPEN CODE TASK (carried from previous session)

**Write test-redactor-v2.js** (scripts/test-redactor-v2.js) and retire test-redactor.js.

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
| 0.3 | CLOSED ✅ |
| PRE-0.4 | CLOSED ✅ |
| 0.4A | IN PROGRESS (0.4A-01 ✅, 0.4A-02 ✅, 0.4A-03 OPEN, 0.4A-04 OPEN) |
| 0.4B+ | NOT STARTED |

---

## KEY AWARENESS

- **0.4B-00 COMPLETE**: DBManager, GraphStore, StaticScanner are parameterized classes. Dev graph: `.dev/data/dev-graph.db`. Runtime graph: `data/mirrorbox.db`. Never share.
- **Tree-sitter fix committed**: Pass full grammar object not `.language` — fixes nodeSubclasses crash on Node v24 arm64.
- **AGENTS.md Section 11**: DID was performed; reconciliation result was not recorded in writing. Content is ratified.
- `test-redactor.js` is deprecated — do not add to it or cite it as coverage evidence.
- Keys were rotated (2026-03-08). Do not query ~/.zshrc for key values.
- DID reconciliation: `.dev/audit/DID_RECONCILIATION.md`
