# Milestone 1.0 — Reconciled DID Plan
**Date:** 2026-03-11
**Session:** Claude Code + Gemini CLI (3-agent DID reconciliation)
**Status:** Awaiting SPEC authoring and human approval

---

## Architecture (Locked)

```
Mirror (/Users/johnserious/MBO)     Subject (/Users/johnserious/MBO_Alpha)     Docker
────────────────────────────────    ──────────────────────────────────────     ──────────────────
Running orchestrator                Clone of MBO — the target codebase         Ephemeral container
Plans + derives changes             Receives validated changes via Pile         Tests MBO_Alpha
dev-graph.db (Mirror graph)         mirrorbox.db (Subject graph)               Throw-away, Stage 4.5/8
```

- **Mirror** = `/Users/johnserious/MBO` — live orchestrator, governance, event store
- **Subject** = `/Users/johnserious/MBO_Alpha` — clone of MBO; what MBO operates ON
- **Docker** = ephemeral per-task sandbox; tests changes against MBO_Alpha before commit
- **Self-referential loop:** MBO develops MBO_Alpha. MBO_Alpha eventually graduates to become the new MBO.
- **Note:** `~/johnseriouscom` runs a separate v0.1 orchestrator — unrelated to MBO. Do not conflate.

---

## Two-World Isolation Rules (Hard)

1. No shared memory or databases between Mirror and Subject
2. Communication is strictly via:
   - **The Relay** (UDS socket) — Subject → Mirror telemetry
   - **The Pile** (promotion engine) — Mirror → Subject code delivery
3. Every cross-world event must carry `world_id` + current Merkle root anchor
4. Every new component must be ≤250 LOC, Cyclomatic Complexity <10 (Entropy Tax)
5. The Pile requires a Mirror quiesce step — cannot promote while Mirror runtime is mutating the same files

---

## Reconciled Task Set

### 1.0-03 — The Relay (Cross-World Telemetry)
**Transport:** Unix Domain Socket (not EventEmitter — UDS enforces physical isolation)

Subject pushes JSON packets to a UDS listener on the Mirror side:
```json
{ "event": "string", "actor": "string", "world_id": "subject", "merkle_root": "hex", "seq": number }
```

Mirror listener appends received events to its EventStore with `world_id: 'subject'`.

**Files:** `src/state/relay-listener.js` (Mirror side), `src/state/relay-emitter.js` (Subject side)

**Spec section needed:** Section 24 — Cross-World Event Streaming

---

### 1.0-04 — The Pile (Promotion Engine)
**Goal:** Move validated code from Mirror to Subject without manual copy.

Protocol:
1. Merkle-check current Mirror state (hash all approved files)
2. Generate delta (list of approved changed files only)
3. Checkpoint Mirror state before promotion
4. `rsync` approved files to Subject path
5. Write cross-world receipt event to Mirror EventStore: `{ stage: 'PILE', world_id: 'subject', merkle_root, files_promoted }`

**Constraint:** Never promotes governance files (`/src/governance/`, `AGENTS.md`, `SPEC.md`) to Subject automatically.

**Files:** `src/state/pile.js`

---

### 1.0-05 — The Guard (Integrity Gatekeeper)
**Goal:** Prevent Subject from corrupting Mirror via the Relay.

The Mirror's UDS listener validates every incoming Subject event before appending to EventStore:
- `world_id` must be `'subject'`
- Event must reference only files within the approved patch scope
- Seq must be contiguous (no gaps)
- No governance file paths permitted in event payload

On violation: bridge severed, incident flag written to `.dev/run/incident.flag`, human notified.

**Files:** `src/state/relay-listener.js` (Guard logic embedded in listener)

---

### 1.0-06 — Stage 6 (Lite) + Stage 7 + Stage 8 Wiring
**Scope:** Scoped for 1.0. Full git branching/3-way merge is 1.1.

- **Stage 6:** `handshake.py`-gated file writes within approved scope only. No new files outside `approvedFiles`. Wired into `operator.js` post-Stage 5 approval.
- **Stage 7:** `validator.py --all` (Entropy Tax). Already exists. Wire into pipeline post-Stage 6.
- **Stage 8:** Execute `testCommand` from onboarding profile. Auto-rollback (restore from pre-Stage-6 checkpoint) on failure.

**Schema addition:**
```sql
CREATE TABLE pipeline_runs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL,
  verdict     TEXT,  -- 'pass' | 'fail' | 'partial'
  notes       TEXT,
  attempt     INTEGER NOT NULL DEFAULT 1,
  timestamp   INTEGER NOT NULL
);
```

**Files:** `src/auth/operator.js` (wire stages), `src/state/db-manager.js` (schema)

---

### 1.0-07 — Subject World Graph Routing
**Goal:** Stage 2 queries the correct graph based on `world_id`.

- Mirror tasks → `dev-graph.db`
- Subject tasks → `mirrorbox.db`

Route in `operator.js` Stage 2 by `world_id` of the active task. MCP server already supports `--mode=dev` vs `--mode=runtime` — wiring is the missing piece.

**Files:** `src/auth/operator.js` (Stage 2 routing)

---

### 1.0-08 — External Invariant Test Suite
**File:** `test/invariant-suite.js` — black-box, standalone, not managed by MBO pipeline

One test per Section 22 invariant:

| Test | Invariant |
|------|-----------|
| Write outside approved scope → reject | 1 |
| Path traversal in approvedFiles → reject | 2 |
| Stage 6 without `go` event → block | 3 |
| Reconstruct pipeline from EventStore → matches original | 4 |
| Force Stage 7 failure → auto-rollback | 5 |
| Direct model call bypassing `callModel` → blocked | 6 |
| Inject planner hash into reviewer context → rejected | 7 |
| Secret env var in sandbox → sanitized | 8 |
| Local model output to external service → blocked | 9 |
| 300-LOC file submitted → validator.py fails | 10/11 |

Run: `node test/invariant-suite.js`
Must pass before every `go` during 1.0 development.

---

### 1.0-09 — Sovereign Loop (1.0 Close Condition)
**Not a code task — a validation milestone.**

The system:
1. Observes a real bug in 1.0-03 Relay code via the Event Relay
2. Drafts a fix in Mirror (full pipeline Stages 1–5)
3. Tests fix in Docker sandbox (Stage 4.5)
4. Human approves → Pile promotes fix to MBO_Alpha
5. Relay confirms receipt event from Subject
6. Merkle root valid throughout

**Pass condition:** System patches itself while maintaining valid Merkle root and all invariants hold.
**This is the moment Claude Code and Gemini CLI step back.**

---

## Dependency Order

```
1.0-03 → 1.0-04 → 1.0-05   (bridge complete)
              ↓
           1.0-06 → 1.0-07   (pipeline complete)
                        ↓
                     1.0-08   (certified)
                        ↓
                     1.0-09   (sovereign loop — 1.0 closes)
```

---

## Open Questions for SPEC Authoring

1. `subjectRoot` field needed in onboarding profile (Section 5) — explicit path to subject codebase
2. Quiesce protocol: exact mechanism for pausing Mirror runtime before Pile promotion
3. MBO_Alpha initialization: is it a `git clone` or `rsync` of Mirror? Who triggers it?
4. UDS socket path: `.dev/run/relay.sock` (proposed)
5. Relay emitter in Subject: runs as a sidecar process or embedded in subject's runtime?

---

*Plan produced via 3-agent DID (Claude Code session 1, Gemini CLI, Claude Code session 2). Awaiting Architect reconciliation and SPEC authoring before implementation begins.*
