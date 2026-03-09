# Mirror Box Orchestrator — Foundation Integrity Report
**Prepared for:** Lead Advisor
**Date:** 2026-03-08
**Prepared by:** Claude Code (Milestone 0.4A)
**Subject:** Structural soundness of the Event Store and Intelligence Graph foundations

---

## 1. Schema Integrity

### PRAGMA integrity_check
```
Result: { "integrity_check": "ok" }
```
SQLite reports no corruption, malformed pages, or structural anomalies.

### Table: `nodes`
| cid | name | type | notnull | pk |
|-----|------|------|---------|-----|
| 0 | id | TEXT | 0 | 1 (PK) |
| 1 | type | TEXT | 1 | 0 |
| 2 | name | TEXT | 1 | 0 |
| 3 | path | TEXT | 1 | 0 |
| 4 | **metadata** | **TEXT** | **0** | **0** |

> **Advisor note:** `metadata` is present as a nullable JSON blob (TEXT). Current data: `{"size": 5632}` per file node. This field is the designated home for future "Self-Baking" logic — hash fingerprints, last-modified timestamps, and incremental staleness signals. It is not skipped.

### Table: `edges`
| cid | name | type | notnull | pk |
|-----|------|------|---------|-----|
| 0 | source_id | TEXT | 1 | 1 (composite PK) |
| 1 | target_id | TEXT | 1 | 2 (composite PK) |
| 2 | relation | TEXT | 1 | 3 (composite PK) |
| 3 | source | TEXT | 1 | 0 |

Composite PK on `(source_id, target_id, relation)` enforces upsert semantics. `source` field distinguishes `static` (Tree-sitter) from `runtime` (Sandbox, added in 0.8).

### Table: `events`
| cid | name | type | notnull | pk |
|-----|------|------|---------|-----|
| 0 | seq | INTEGER | 0 | 1 (autoincrement) |
| 1 | id | TEXT | 1 | 0 (UNIQUE) |
| 2 | timestamp | INTEGER | 1 | 0 |
| 3 | stage | TEXT | 1 | 0 |
| 4 | actor | TEXT | 1 | 0 |
| 5 | payload | TEXT | 1 | 0 |
| 6 | hash | TEXT | 1 | 0 |
| 7 | parent_event_id | TEXT | 0 | 0 |
| 8 | prev_hash | TEXT | 0 | 0 |

`seq` assigned inside SQLite transaction (monotonic, no gaps). `prev_hash` implements hash chaining. `parent_event_id` is the logical causality link (may differ from seq-1).

---

## 2. Chain of Custody Proof

Both the Node.js and Python verifiers were run independently against `data/mirrorbox.db`.

### verify-chain.js (Node.js)
```
Auditing Mirror Box Chain of Custody: /data/mirrorbox.db
PASS: Verified 12 events. Chain intact from seq 1 → 12.
Anchor run_id: migration-seed | tail hash: f32d33035a0dcd30...
```

### verify-chain.py (Python)
```
Auditing Mirror Box Chain of Custody: /data/mirrorbox.db
PASS: Verified 12 events. Chain intact from seq 1 → 12.
Anchor run_id: migration-seed | tail hash: f32d33035a0dcd30...
```

Both verifiers independently confirm:
- **Sequence continuity:** No gaps in seq 1–12
- **Hash chaining:** Every `prev_hash` matches the preceding event's `hash`
- **Envelope integrity:** SHA-256 recomputed from `{id, seq, stage, actor, timestamp, parent_event_id, prev_hash, payload}` matches stored hash for all 12 events
- **Root event:** seq 1 has `prev_hash = null` ✓
- **Anchor:** `chain_anchors` tail hash matches chain end ✓

> **Advisor note on "Cheesecake" integrity:** The hashes line up. The chain is immutable and append-only. Any deletion, insertion, or reordering of events would break the `prev_hash` link at the tampered position and fail both verifiers independently. The structure will hold downstream.

---

## 3. Firewall Verification — Redaction Scanner

`scripts/test-redactor-v2.js` was run against the current `src/state/redactor.js`.

```
--- Mirror Box Redactor Verification v2 ---
[PASS] Raw string OpenRouter
[PASS] Raw string Anthropic (sk-ant-api03-*)
[PASS] Object with camelCase apiKey
[PASS] Object with secretKey
[PASS] Buffer-encoded key value
[PASS] Nested object
[PASS] Multiple secrets in one string
[PASS] Clean object (must pass through unmodified)
[PASS] String at position 0 (offset regression check)

VERIFICATION_PASS: All Invariant 8 bypass vectors closed.
```

> **Advisor note on "SamA leakage":** Redaction runs inside `callModel()` before the payload reaches the event store — step 4 of the `callModel` enforcement chain (SPEC.md Section 10). The secret is replaced with `[REDACTED:{type}]` before any write occurs. A secret cannot hit `transcript.jsonl` through the `callModel` path. The "String at position 0" test is a regression guard against BUG-023 — the original offset bug that caused the redactor to miss secrets at the start of a buffer.

---

## 4. Graph Query Simulation

**Target:** `src/auth/call-model.js` — the most structurally significant file in the current codebase. Every model invocation must pass through the `callModel` function it defines (Invariant 6).

### Node Record
```json
{
  "id": "file://src/auth/call-model.js",
  "type": "file",
  "name": "call-model.js",
  "path": "src/auth/call-model.js",
  "metadata": { "size": 5632 }
}
```

### Outbound Edges (DEFINES + IMPORTS)
```
DEFINES → file://src/auth/call-model.js#callCliProvider
DEFINES → file://src/auth/call-model.js#callLocalProvider
DEFINES → file://src/auth/call-model.js#callModel
DEFINES → file://src/auth/call-model.js#callOpenRouter
IMPORTS → import://./model-router
IMPORTS → import://child_process
IMPORTS → import://https
IMPORTS → import://http
```

### Inbound CALLS Edges
```
(none at Milestone 0.4A — cross-file call resolution requires LSP, added in 0.4B)
```

### Graph State Summary
```
Files:               12
Functions:           40
Import placeholders: 19
Total nodes:         76
```

> **Advisor note on "flying blind":** The Tree-sitter edges are connecting. DEFINES and IMPORTS edges are populated and accurate. The absence of CALLS edges is expected and documented — this is the known LSP gap that 0.4B closes. The graph is honest about what it knows at this milestone. The Architecture Planner can correctly determine what a file imports and what it defines. It cannot yet trace cross-file call chains. That is the 0.4B deliverable.

---

## 5. Staleness Logic — BUG-009 Status

**Current status: NOT YET IMPLEMENTED. Documented as BUG-009 (P2, deferred).**

The `metadata` field exists and is populated per file node. The staleness mechanism — comparing a stored content hash against current disk state — has not been built yet.

What must be built (targeted for 0.4A-03/0.4A-04):
- Store `content_hash: SHA-256(file contents)` in `metadata` at scan time
- Add `checkStaleness(projectRoot)` to `GraphStore` — walk all `file` nodes, rehash disk content, return diverged nodes
- Operator calls this before each task to determine whether re-scan is needed

The schema foundation is ready. The logic is the next layer.

---

## Summary Assessment

| Requirement | Status | Note |
|-------------|--------|------|
| Schema integrity | ✅ PASS | `integrity_check: ok`. `metadata` field present on nodes. |
| Chain of custody | ✅ PASS | 12 events verified by both JS and Python independently. No breaks. |
| Firewall / redaction | ✅ PASS | All 9 bypass vectors closed. Pre-write redaction confirmed. |
| Graph connectivity | ✅ PARTIAL | DEFINES and IMPORTS working. CALLS edges pending LSP (0.4B). |
| Staleness detection | ⚠️ NOT YET BUILT | BUG-009, P2. Schema ready. Logic deferred to 0.4A/0.4B. |

The foundation is structurally sound. The two honest gaps are CALLS edge resolution (a known 0.4B dependency) and staleness detection (a known P2 deferred item). Neither is a hidden failure — both are documented, scoped, and have a clear implementation path.
