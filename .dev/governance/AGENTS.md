# AGENTS.md
## Mirror Box Orchestrator — Autonomous Agent Governance (v1.0)

**Scope:** This document governs the behavior of MBO's autonomous pipeline. It is consulted at every task execution. Read at the start of every session.

---

## Section 1 — Session Start Protocol

Every development session begins in this order. No exceptions.

1. Read this file (`AGENTS.md`)
2. Read `.dev/governance/projecttracking.md` — identify current milestone and active task
3. Read `.dev/governance/BUGS.md` — check for anything P0 blocking current milestone
4. Read `.dev/sessions/NEXT_SESSION.md` — orientation and handoff

No code is written before this sequence completes.

---

## Section 2 — Development Protocol (DID) & Routing Tiers

**Every task must exist in `projecttracking.md` before code is written.**

The agents are interchangeable peers. Before executing a task, the human Operator determines the Routing Tier:

**Tier 0 & 1 (Low Risk / Single File / Docs):**
- A single agent proposes the implementation and writes the diff. 
- If the human approves, that agent implements it directly.

**Tier 2 & 3 (High Risk / Multi-File / Architecture / Governance):** (Dual Independent Derivation)
1. Any modification to `SPEC.md`, `AGENTS.md`, or the governance directory.
2. Agent A (Gemini or Claude) proposes the implementation and writes the diff. 
3. Agent B (the other agent) MUST independently derive their own implementation BLIND.
4. The human Operator reconciles the two versions.
5. Only after reconciliation and human "go" is the implementation committed.

---

## Section 3 — Authorship & Attribution Policy

1. **Authorship is for the Architect:** No agent shall claim authorship credit on commit pushes, pull requests, or documentation.
2. **Metadata Only:** Agents may be identified in Git metadata as the `Committer` or within a `Co-authored-by:` trailer, but the `Author` field is reserved exclusively for the human architect.
3. **No "AI-Generated" Branding:** Agents must not prepend "AI-Generated" or similar self-crediting labels to commit messages unless explicitly configured by the architect for audit purposes.

---

## Section 4 — What Agents Can and Cannot Do (Security Invariants)

| Agent | Can | Cannot |
|-------|-----|--------|
| Gemini CLI | Peer developer. Propose, review, derive, and implement. | Write to src/ without task in projecttracking.md |
| Claude Code | Peer developer. Propose, review, derive, and implement. | See the other agent's reasoning before producing its own |

### Core Security Invariants (v1.0)
1. **Invariant 1:** No unapproved file modifications.
2. **Invariant 2:** No write access outside project root.
3. **Invariant 3:** No execution without human approval.
4. **Invariant 4:** Every operation reproducible from the event store.
5. **Invariant 5:** Failed builds revert automatically.
6. **Invariant 6:** No model bypasses `callModel`.
7. **Invariant 7:** Context isolation enforced at runtime.
8. **Invariant 8:** Secrets never enter sandbox execution.
9. **Invariant 9:** Local models stay local.

---

## Section 5 — Session Management & Two-World Integrity

### Invariant 10 (Two-World Isolation)
- Every operation shall explicitly declare its target scope: `world_id = mirror | subject`.
- Reads may span worlds; writes must target exactly one world.
- Missing or invalid `world_id` is a hard failure.

### Invariant 11 (Graph Investigation)
- Retrieval must use `graph_search` and `graph_query_impact`.
- Full SPEC/file-dump context injection is disallowed by default.

### Invariant 12 (HardState Budget)
- Enforce 5,000-token HardState ceiling.
- Allocation: 600 invariants, 1,800 evidence, 1,200 prior decisions, 900 reasoning, 500 reserve.

### Invariant 13 (Pre-Mutation Checkpoints)
- Immutable checkpoint required before any mutation in either world.

### Invariant 15 (Non-Destructive Recovery)
- Prohibit `rm -f` and delete/recreate schema recovery patterns.

### Invariant 16 (Atomic Session-End Backup)
- On session close, atomically persist event flush, graph delta, handoff record, and integrity hashes.
- Run `PRAGMA integrity_check`.

---

## Section 6 — Proactive State Sync & Session Protocols

### 6A. The Audit Gate (Completion Trigger)
The moment a task is implemented and Stage 8 passes, halt and present the audit package:
1. Unified diff of all changes.
2. Full output of `python3 bin/validator.py --all`.
3. One-paragraph summary.

### 6B. State Sync (Automatic on Approval)
On `approved`: Update `projecttracking.md`, `CHANGELOG.md`, `BUGS.md`, and commit the changes.

### 6C. Session End
If "end session" is requested: Write `NEXT_SESSION.md`, terminate MCP, and output checklist.

---

## Section 7 — Critical Constraints

1. `callModel` is the only path to any model.
2. No file write outside approved scope.
3. No code touches a real repository without human `go`.
4. Every model call logged to event store before and after.
5. Reviewer never sees planner output before Stage 4C.

---

## Section 8 — Required Affirmation

Before this session proceeds, you must physically read the governance files and report the base nhash:
`(AGENTS sections + BUGS sections + NEXT_SESSION sections) × 3 = [Base Result]`
Wait for human salt, calculate final result, and state: "I will not make assumptions about the intentions of the human at any time."

---

## Section 9 — Strict Mode (Code Output Constraints)

1. **Unified Diffs Only:** All modifications must be proposed as a unified diff.
2. **No stylistic or cleanup changes** unless they fix a functional bug or improve performance >10%.
3. **Handshake Protocol:** 
   - `src/**`: Locked (444). Ask human for `mbo auth src`, wait for `go`, use `impl_step.sh`.
   - `.dev/governance/**`, `scripts/**`, `bin/**`: Unlocked. Use `impl_step.sh`.

---

## Section 10 — Hard State Persistence

Explicitly state your **Hard State Anchor** at the beginning of every internal `<thinking>` block: `<thinking>[Hard State: X] ...`

---

## Section 11 — Graph-Assisted Context

Run only the queries listed in NEXT_SESSION.md. Load only the files and SPEC sections those queries return. If the dev graph server is unavailable, state: "Dev graph unavailable. Cannot load context. Awaiting human instruction to resolve MCP."

---

## Section 12 — MBO Operational Workflow (Sovereign Loop)

Every development session MUST follow this checklist:
1. **Identify Task** from `projecttracking.md`.
2. **Permission Check** via `python3 bin/handshake.py <cell_name>`.
3. **Derive & Propose** solution from graph context.
4. **Human Approval** ("go").
5. **Implement & Validate** (`python3 bin/validator.py --all`).
6. **Audit Gate** (diff + validator output + summary).
7. **Sync State** (`projecttracking.md`, `CHANGELOG.md`, `BUGS.md`).
8. **Lock & Journal** (`handshake.py --revoke` and `init_state.py`).

---

*Last updated: 2026-03-13*
