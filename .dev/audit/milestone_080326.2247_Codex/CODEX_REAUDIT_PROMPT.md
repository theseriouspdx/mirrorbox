# Mirror Box Orchestrator — Milestone 0.3 Re-Audit Prompt
## For: Codex (blind independent audit — DID second agent)
## Run ID: 0.3-reaudit-[date]-Codex

---

## YOUR ROLE

You are an adversarial auditor performing a **blind independent audit** of Mirror Box Orchestrator Milestone 0.3.

This is a DID (Dual Independent Derivation) audit. A prior audit was conducted by Claude Code and produced findings. You have NOT seen those findings. You must derive your own conclusions independently before any comparison occurs.

Do not implement code. Produce audit artifacts only.

---

## WHAT YOU ARE AUDITING

Milestone 0.3 — State and Event Foundation.

The implementation claims to satisfy:
- Section 7 of SPEC.md (Event Store — append-only, chain-linked hash, secret redaction)
- Section 17 of SPEC.md (State and Observability — SQLite, state.json, recovery)
- Invariant 4 (every operation reproducible from the event store)
- Invariant 8 (secrets never enter persistent state)

A prior audit found failures. Fixes were applied. This re-audit must independently verify whether those fixes hold — without relying on the prior audit's conclusions.

---

## MANDATORY READS (do these first, in order)

1. `/Users/johnserious/mbo/.dev/spec/SPEC.md` — Section 7 and Section 17 are primary. Section 22 (invariants) is required.
2. `/Users/johnserious/mbo/.dev/governance/AGENTS.md` — governance constraints that apply to this codebase
3. `/Users/johnserious/mbo/.dev/governance/BUGS.md` — know what was filed, but derive your findings independently before consulting this
4. `/Users/johnserious/mbo/.dev/governance/projecttracking.md` — current milestone state
5. Source files under audit:
   - `/Users/johnserious/mbo/src/state/redactor.js`
   - `/Users/johnserious/mbo/src/state/event-store.js`
   - `/Users/johnserious/mbo/src/state/state-manager.js`
   - `/Users/johnserious/mbo/src/state/db-manager.js`
6. Verification scripts:
   - `/Users/johnserious/mbo/scripts/verify-chain.js`
   - `/Users/johnserious/mbo/scripts/verify-chain.py`
   - `/Users/johnserious/mbo/scripts/test-redactor.js`
   - `/Users/johnserious/mbo/scripts/test-state.js`
   - `/Users/johnserious/mbo/scripts/test-recovery.js`
7. Original audit artifacts (read AFTER forming your own findings):
   - `/Users/johnserious/mbo/.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md`
   - `/Users/johnserious/mbo/.dev/audit/0.3_080326.2137_Claude-Code/bypass_proofs.js`
   - `/Users/johnserious/mbo/.dev/audit/0.3_080326.2137_Claude-Code/chain_tamper_proof.js`

---

## AUDIT PROCEDURE

### Phase A — Scope Lock
State:
- Files under review (exact list)
- Invariants under test (cite section numbers)
- Audit objective: verify Milestone 0.3 is safe to close and PRE-0.4 spec work can begin

### Phase B — Independent Verification

For each of the four original findings, independently verify the current code:

**Finding 1 — Redactor (Invariant 8)**

Read `redactor.js`. Answer without running any tests first:
- Does the replace callback correctly handle patterns with zero capture groups?
- Is the `group1` / offset confusion resolved?
- Are Buffer-encoded values handled?
- Are camelCase field names in objects caught?

Then run:
```bash
cd /Users/johnserious/mbo
node -e "
const { redact } = require('./src/state/redactor');
const cases = [
  ['Raw string', 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890'],
  ['Object camelCase apiKey', JSON.stringify(redact({ apiKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890' }))],
  ['Buffer-encoded key', JSON.stringify(redact({ key: Buffer.from('sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890') }))],
  ['camelCase secretKey', JSON.stringify(redact({ secretKey: 'supersecretvalue12345678' }))],
  ['Anthropic key', JSON.stringify(redact({ message: 'sk-ant-api03-AAABBBCCCDDDEEEFFFGGGHHH111222333444555666' }))],
  ['Nested object', JSON.stringify(redact({ config: { auth: { token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' } } }))],
];
cases.forEach(([label, result]) => {
  const pass = result.includes('[REDACTED:');
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + label + ' → ' + result.substring(0, 80));
});
"
```

State your verdict: PASS or FAIL with evidence.

**Finding 2 — Chain Hash Integrity (Invariant 4)**

Read `event-store.js`. Answer without running tests first:
- Is the hash computed over a canonical envelope that includes `parentHash` or `parent_event_id`?
- Does modifying one event's payload invalidate downstream hashes?
- Is `seq` assigned inside the transaction?

Then run:
```bash
cd /Users/johnserious/mbo
node scripts/verify-chain.js
```

Then attempt a tamper proof. Create a copy of the DB, modify a payload directly in SQLite, recompute only that event's hash, and verify whether `verify-chain.js` catches it:
```bash
cp /Users/johnserious/mbo/data/mirrorbox.db /tmp/mirrorbox_reaudit_tamper.db
node -e "
const Database = require('better-sqlite3');
const crypto = require('crypto');
const db = new Database('/tmp/mirrorbox_reaudit_tamper.db');
const event = db.prepare('SELECT * FROM events ORDER BY seq ASC LIMIT 1 OFFSET 1').get();
if (!event) { console.log('Not enough events to tamper'); process.exit(0); }
const newPayload = JSON.stringify({ message: 'TAMPERED' });
const envelope = JSON.stringify({ id: event.id, seq: event.seq, stage: event.stage, actor: event.actor, timestamp: event.timestamp, parent_event_id: event.parent_event_id, payload: newPayload });
const newHash = crypto.createHash('sha256').update(envelope).digest('hex');
db.prepare('UPDATE events SET payload = ?, hash = ? WHERE seq = ?').run(newPayload, newHash, event.seq);
console.log('Tampered event seq ' + event.seq);
db.close();
"
node scripts/verify-chain.js /tmp/mirrorbox_reaudit_tamper.db
```

State your verdict: does the verifier catch the tamper? PASS (tamper detected) or FAIL (tamper undetected).

**Finding 3 — Transaction Ordering (Invariant 4)**

Read `event-store.js`. Confirm:
- Are `id`, `timestamp`, and `seq` all assigned inside the `db.transaction()` call?
- Is `seq` sourced from `lastInsertRowid` (inside transaction) rather than assigned before the transaction opens?

State your verdict: PASS or FAIL with line-level evidence from the code.

**Finding 4 — Recovery Type Guard (Section 17)**

Read `state-manager.js`. Confirm:
- Does `recover()` query specifically for snapshot-type events (e.g., `WHERE stage = 'STATE'`)?
- Does it validate the schema of the recovered payload before returning?
- What happens if no snapshot event exists?

Run:
```bash
cd /Users/johnserious/mbo && node scripts/test-recovery.js
```

State your verdict: PASS or FAIL with evidence.

### Phase C — Additional Surface Review

Beyond the four original findings, review the following:

1. **Secret pattern coverage** — Does the redactor cover Anthropic keys (`sk-ant-api03-*`)? Are there common secret formats it misses?

2. **verify-chain.js vs verify-chain.py parity** — Do both verifiers implement the same chain-linked hash check? Run both and confirm they agree.

3. **Schema migration safety** — In `db-manager.js`, if the `events` table exists but lacks the `seq` column, a migration runs. Is that migration correct and safe? Could it lose data or corrupt ordering?

4. **test-redactor.js false confidence** — Read the test cases. Do they test the actual failure modes (object payloads, match at non-zero offset) or only easy cases?

5. **Event store append — atomicity** — If the process is killed between the `INSERT` and the `UPDATE events SET hash` call, is the event store left in a corrupt state?

### Phase D — Go/No-Go Decision

Based solely on your independent findings, return one of:
- `GO` — Milestone 0.3 is clean. PRE-0.4 spec work can begin.
- `GO WITH CONDITIONS` — List exact conditions with verification commands.
- `NO-GO` — List blocking findings with reproduction steps.

---

## DELIVERABLES

Write your output to:
```
/Users/johnserious/mbo/.dev/audit/0.3-reaudit-[YYYYMMDD]-Codex/AUDIT_REPORT.md
```

Structure:
1. Scope Lock
2. Finding 1 — Redactor: verdict + evidence
3. Finding 2 — Chain Hash: verdict + evidence
4. Finding 3 — Transaction Ordering: verdict + evidence
5. Finding 4 — Recovery Type Guard: verdict + evidence
6. Additional Surface Review findings (numbered, severity-labeled)
7. Go/No-Go Decision
8. If not GO: exact unblock conditions with verification commands

---

## AFTER YOU PRODUCE YOUR REPORT

Do not compare with the prior audit until your report is written and saved.

Once your report exists, read:
- `/Users/johnserious/mbo/.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md`

Then produce a DID reconciliation note appended to your report:
- Where do you agree with the prior audit?
- Where do you diverge?
- If you diverge on a finding's verdict (PASS vs FAIL), explain why — do not simply defer to the prior audit.

---

## IMPORTANT NOTES

- The `bypass_proofs.js` script in the prior audit directory is a **proof-of-failure tool**, not a proof-of-fix tool. Its probes are hardcoded to expect leaks. Do not use its pass/fail output to assess the current state of the redactor. Run your own tests as specified above.
- `test-redactor.js` may have been written to pass against broken code. Treat it with suspicion until you have verified its test cases independently.
- The prior audit commit message claimed "Resolve Radius One audit findings (BUG-023 through BUG-029)." That claim was false for at least one finding. Assume nothing is fixed until you verify it yourself.

---

*This prompt is a DID instrument. Do not share your findings with any other agent before completing your own report.*
