# Adversarial Audit Report — Milestone 0.3
## Mirror Box Orchestrator — State + Event Foundation

**Auditor:** Claude Code
**Date:** 2026-03-08 21:37
**Hard State Anchor:** 456
**Scope:** `src/state/`, `scripts/verify-chain.{js,py}`, `data/mirrorbox.db`
**Verdict:** **AUDIT_FAIL**

---

## Executive Summary

Two invariant violations were demonstrated with live artifacts. One is a confirmed data leak visible in the current `mirrorbox.db`. The other is a confirmed chain-integrity bypass proven on a copy of the database.

---

## FINDING 1 — CRITICAL: Invariant 8 Violated (Secret Leakage to Persistent State)

**Status:** CONFIRMED — live secret present in `data/mirrorbox.db` Event 2
**File:** `src/state/redactor.js`
**Root Cause:** JavaScript replace-callback parameter confusion for patterns without capture groups.

### Technical Detail

The `redact()` function applies each pattern via:

```js
content = content.replace(regex, (match, group1) => {
  if (group1) {
    return match.replace(group1, `[REDACTED:${name}]`);
  }
  return `[REDACTED:${name}]`;
});
```

In JavaScript, the signature of a `String.replace()` callback is:
```
(match, ...captureGroups, offset, inputString)
```

For patterns **without a capture group** (OpenRouter, GitHub, OpenAI, Slack), there are no capture groups. The parameter named `group1` in the code is therefore the **numeric offset** (character position of the match in the string), not a captured value.

The logic proceeds:
- `if (group1)` evaluates as `if (offset)`
- If offset is **0** (match at start of string): `if (0)` = `false` → correct path → returns `[REDACTED:Name]` ✓
- If offset is **> 0** (match anywhere else in string): `if (N)` = `true` → wrong path → calls `match.replace(N.toString(), '[REDACTED:Name]')`, which replaces the string representation of the integer offset within the match token

**Effect in practice:**

| Scenario | Result |
|---|---|
| Raw string redact, match at index 0 | Correctly redacted ✓ |
| Object payload (JSON-stringified), match at index > 0 | Garbled or no-op redaction ✗ |
| `apiKey` (camelCase) not in GenericSecret list | OpenRouter regex fires but does a no-op replace → key passes to DB |
| `gitToken` with GitHub token | GitHub regex fires, offset digit string = `"123"` found in `ghp_1234567890...`, replaces wrong substring |

### Live Evidence

Event 2 in `data/mirrorbox.db` (`stage=PLANNING, actor=ORCHESTRATOR`):

```json
{
  "message": "Simulating a model call with an API key.",
  "apiKey": "sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890",
  "gitToken": "ghp_[REDACTED:GitHub]4567890abcdefghijklmnopqrstuvwxyz"
}
```

- `apiKey` value: **full OpenRouter key leaked unredacted**
- `gitToken` value: **partially redacted at wrong offset** — the digits `"123"` (matching the integer offset of the match start position) were replaced, leaving `4567890abcdef...` exposed

### Additional Bypass Vectors (not in live DB but demonstrated by test)

```
# T6: Buffer-encoded secret — serialize to integer array, bypasses all regex
redact({ key: Buffer.from('sk-or-v1-realkey') })
→ {"key":{"type":"Buffer","data":[115,107,45,111,114,...]}}  (not redacted)

# T7: camelCase field names not in GenericSecret allowlist
redact({ secretKey: 'supersecretvalue12345678' })
→ {"secretKey":"supersecretvalue12345678"}  (not redacted)

# Anthropic API key format not in pattern list
redact({ api_key: 'sk-ant-api03-AAABBBCCC...' })
→ caught by GenericSecret only if field name matches list ✓ (but raw in string → not caught)

# GitHub fine-grained PAT (github_pat_*) not covered
redact({ token: 'github_pat_11ABCDEF0_XYZ...' })
→ caught by GenericSecret only if field name matches ✓ (but same concerns apply)
```

---

## FINDING 2 — HIGH: Invariant 4 Violated (Chain Forgery Undetected)

**Status:** CONFIRMED — tampered DB passes both `verify-chain.js` and `verify-chain.py`
**File:** `src/state/event-store.js`, `scripts/verify-chain.{js,py}`
**Root Cause:** Hash is `sha256(payload)` only — no Merkle linkage. Parent ties are a separate foreign-key check.

### Technical Detail

Each event stores:
```
hash = sha256(payload)
parent_event_id = previous event's id
```

The verify-chain tools check:
1. `sha256(payload) == stored_hash` — payload integrity
2. `event[N].parent_event_id == event[N-1].id` — link integrity

These two checks are **independent**. Neither check commits the hash to any external anchor or includes the parent's hash in the current event's hash computation.

An attacker with SQLite write access can:
1. `UPDATE events SET payload = '<new_content>', hash = sha256('<new_content>') WHERE id = '<target>'`
2. `parent_event_id` is unchanged

Both verifiers report **PASS** because each hash matches its own payload and parent links are intact.

### Live Demonstration

Tampered DB at `/tmp/mirrorbox_tampered.db`. Event 2 was rewritten:

```
ORIGINAL payload: {"message":"Simulating a model call with an API key.","apiKe...
ORIGINAL hash:    5414c1bedd2827debf995f74d8be13e4811b5c5f47db9fa89cb3466f313444df

TAMPERED payload: {"message":"TAMPERED - Secrets deleted","apiKey":"clean"}
TAMPERED hash:    20739c06741e4b6f8156df3f32e2c36f210335e3554c730d4f528744981d1f1e
```

Result from both verifiers on tampered DB:
```
node verify-chain.js   → PASS: Verified 3 events in the chain.
python verify-chain.py → {"status": "PASS", "event_count": 3}
```

### Fix Required

Chain integrity requires each event's hash to include its parent's hash:
```
hash = sha256(payload + parent_hash)
```
This creates a Merkle chain where modifying any event invalidates all descendant hashes. The current scheme provides payload integrity but not chain integrity.

---

## FINDING 3 — MEDIUM: Transaction Race / Non-Deterministic Ordering

**Status:** Design risk — not exploitable in single-process sync Node.js, but structural flaw
**File:** `src/state/event-store.js`

### Technical Detail

`id` (UUID) and `timestamp` are assigned **outside** the transaction:

```js
append(stage, actor, payload) {
  const id = crypto.randomUUID();          // outside tx
  const timestamp = Date.now();            // outside tx

  return db.transaction(() => {
    const lastEvent = db.get('SELECT id FROM events ORDER BY timestamp DESC, id DESC LIMIT 1');
    ...
  });
}
```

If two `append()` calls receive the same millisecond timestamp (sub-ms collision or test fixtures), the tiebreak ordering is `ORDER BY id DESC` which is UUID sort order — **lexicographically random, not insertion-ordered**. The chain ordering becomes non-deterministic and will differ across processes or replays.

Additionally, if the process is killed between UUID generation and the `db.transaction()` call, the id and timestamp are lost without any partial state — this is acceptable — but the timestamp/id assignment should logically be inside the transaction to ensure atomicity of all chain metadata.

---

## FINDING 4 — LOW: Recovery Returns Last Event, Not Full Snapshot

**Status:** Design gap — correct for snapshot-per-event discipline; breaks silently if violated
**File:** `src/state/state-manager.js`

### Technical Detail

```js
recover() {
  const lastEvent = db.get('SELECT payload FROM events ORDER BY timestamp DESC LIMIT 1');
  if (lastEvent) {
    return JSON.parse(lastEvent.payload);
  }
  return null;
}
```

Recovery returns the most recent event payload. This is correct **only if** every event represents a complete state snapshot. If any non-snapshot event (e.g., a raw model call log) is the most recent row, `recover()` returns partial/incorrect state with no error or warning.

Furthermore, recovered payloads may contain `[REDACTED:...]` strings in place of actual values (e.g., model endpoints, config paths that were redacted) — the recovered state would be silently corrupted.

---

## Summary Table

| # | Finding | Invariant | Severity | Demonstrated |
|---|---------|-----------|----------|--------------|
| 1 | Redactor callback offset/group1 confusion leaks secrets | Invariant 8 | CRITICAL | Live DB — `sk-or-v1-...` in Event 2 |
| 2 | Chain hash is `sha256(payload)` only — forgery undetected | Invariant 4 | HIGH | Tampered DB passes both verifiers |
| 3 | Non-deterministic chain ordering on timestamp collision | Invariant 4 (ordering) | MEDIUM | Code analysis |
| 4 | `recover()` blindly parses last event, not guaranteed snapshot | Section 17 | LOW | Code analysis |

---

## Verdict

**AUDIT_FAIL [FINDING-1: Invariant 8 — Live secret (OpenRouter key) confirmed in mirrorbox.db Event 2; FINDING-2: Invariant 4 — Chain forgery passes both verify-chain tools on tampered database]**

---

## Artifacts

- `AUDIT_REPORT.md` — this file
- `bypass_proofs.js` — executable bypass tests
- `chain_tamper_proof.js` — chain forgery demonstration

*Audit session Hard State Anchor: 456*
