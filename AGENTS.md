# AGENTS.md
## Mirror Box Orchestrator — Autonomous Agent Governance (v1.0)

**Scope:** This document governs the behavior of MBO's autonomous pipeline. It is consulted at every task execution once the system has reached Milestone 1.0 (Self-Referential).

---

## Section 1 — The Prime Directive
[Synthesized during Onboarding Phase 4 and injected into every model call at runtime.]

---

## Section 2 — Pipeline Integrity (Section 15)
All changes must pass through the 11-stage pipeline. No code touches the repository without a human typing "go" at Stage 5.

---

## Section 3 — Authorship & Attribution Policy
1. **Authorship is for the Architect:** No agent shall claim authorship credit on commit pushes, pull requests, or documentation.
2. **Metadata Only:** Agents may be identified in Git metadata as the `Committer` or within a `Co-authored-by:` trailer, but the `Author` field is reserved exclusively for the human architect.
3. **No "AI-Generated" Branding:** Agents must not prepend "AI-Generated" or similar self-crediting labels to commit messages unless explicitly configured by the architect for audit purposes.

---

## Section 4 — Security Invariants (Section 22)
1. **Invariant 1:** No unapproved file modifications. `writeFile` validates every target path against the approved list before writing.
2. **Invariant 2:** No write access outside project root. Path traversal checked on every write operation.
3. **Invariant 3:** No execution without human approval. `go` confirmation required at Stage 5. 
4. **Invariant 4:** Every operation reproducible from the event store. Append-only event log with parent references allows full pipeline reconstruction.
5. **Invariant 5:** Failed builds revert automatically. Stage 7 and 9 failures trigger automatic branch deletion and workspace reset.
6. **Invariant 6:** No model bypasses `callModel`. Firewall applied to every model invocation without exception.
7. **Invariant 7:** Context isolation enforced at runtime. `ReviewerInput` type does not contain planner output fields, and prompts are scanned for Planner content hashes before dispatch.
8. **Invariant 8:** Secrets never enter sandbox execution. Environment sanitized before container spawn.
9. **Invariant 9:** Local models stay local. No local model output is transmitted to external services.

---

## Section 5 — Session Management & Two-World Integrity
1. **Invariant 10 (Two-World Isolation):** Every operation must declare `world_id` as `mirror` or `subject`. Reads may span worlds; writes must target exactly one world. Missing or invalid `world_id` is a hard failure and must stop execution.
2. **Invariant 11 (Graph Investigation):** All investigations shall follow the mandatory 4-step retrieval loop: (1) Intent, (2) Expansion, (3) Evidence, (4) Deepen. Retrieval must use `graph_search` and `graph_query_impact`. Full SPEC injection or large file-dump context injection is prohibited by default unless explicitly approved by the architect.
3. **Invariant 12 (HardState Budget):** HardState must not exceed 5,000 tokens. Allocation shall be enforced as: 600 tokens for invariants/objective, 1,800 tokens for evidence, 1,200 tokens for prior decisions, 900 tokens for reasoning, and 500 tokens for reserve/safety. Governance invariants are non-evictable.
4. **Invariant 13 (Pre-Mutation Checkpoints):** Before any mutation in either world, the system must create an immutable checkpoint. Each checkpoint shall include a cryptographic hash and parent reference sufficient for deterministic replay.
5. **Invariant 15 (Non-Destructive Recovery):** `rm -f` and delete/recreate patterns for schema recovery are prohibited. Recovery must use forward migrations, compatibility adapters, event replay, or checkpoint rollback.
6. **Invariant 16 (Atomic Session-End Backup):** On session close, the system must atomically persist event flush, graph delta/index update, handoff record, checkpoint IDs, and integrity hashes. `PRAGMA integrity_check` must run as backup validation. Session status must be marked `closed_clean` or `closed_with_incident`.

---

## Section 6 — Strict Edit Mode

1. **Read-Only by Default:** Every task must begin in read-only mode.
2. **No Mutation Without Approval:** No write operation is allowed without explicit human approval. This includes `writeFile`, `apply_patch`, in-place edits, generation scripts, migrations, and deletes.
3. **Approval Token:** The required approval token is `go`.
4. **Scope Lock:** After `go`, edits are limited to the explicitly approved file list. Any out-of-scope write is a hard failure and execution must stop.
5. **One-Batch Approval:** A `go` applies to one edit batch only. Additional edits require a new `go`.
6. **All modifications proposed as unified diffs only** — no full-file replacements.
7. **No stylistic or cleanup changes** unless they fix a functional bug or improve performance >10%. If nothing needs changing: output `NO_CHANGE`.

### Mandatory Pre-Edit Self-Check
Before any write action, the agent must answer:
1. **Q1:** Do I have enough detail from spec/docs to proceed without assumptions?
2. **Q2:** Am I choosing an approach that differs from spec or existing implementation?
3. **Q3:** Am I making any assumption not explicitly confirmed by the human or documentation?

Decision rules:
- If **Q1 = No**: STOP and ask for clarification.
- If **Q2 = Yes**: STOP and request explicit approval for the deviation.
- If **Q3 = Yes**: STOP and ask clarifying question(s).
- Only when **Q1 = Yes**, **Q2 = No**, and **Q3 = No** may the agent request `go` for edits.

### Handshake Protocol — File Write Access

Two categories of files with different rules:

| Path | Locked? | What to do |
|------|---------|------------|
| `src/**` | Yes — 444/555 by Fortress | Ask human to run `mbo auth src`, wait for `go`, then use `impl_step.sh` |
| `.dev/governance/**` | No — normal 600 files | Use `impl_step.sh` directly, no handshake needed |
| `scripts/**`, `bin/**` | No | Use `impl_step.sh` directly, no handshake needed |

**Agents cannot run `mbo auth`** — `MBO_HUMAN_TOKEN` is never available to agents. Do not attempt it.

For `src/` changes: propose diff → state "please run `mbo auth src`" → wait for human `go` → run `impl_step.sh`.

**Session TTL is 30 minutes.** Once the human runs `mbo auth src`, all subsequent `src/` writes in that session go through `impl_step.sh` without asking again. Do not re-request `mbo auth src` for every file — check `mbo status` first. If the session is still active, proceed directly.

If `impl_step.sh` returns `BLOCKED`: stop, ask human to run `mbo auth src` again.

Never use `mbo .` (permanently blocked), never use `chmod`, never write files directly outside `impl_step.sh`.

### Hard Stop Conditions

Halt immediately and state the specific condition if:
- **Dev graph unreachable** → attempt MCP recovery; if still unreachable state "Dev graph unavailable. Awaiting human instruction." Do not load SPEC.md. Do not proceed.
- **nhash lost mid-session** → state "CONTEXT LOST. REQUESTING NEW NHASH PROTOCOL." Do not proceed.
- **Missing `world_id` on any proposed mutation** → hard stop; do not guess the scope.
- **SPEC conflict with existing code** → file in `BUGS.md`; do not implement a workaround; do not proceed.
- **Architectural ambiguity** → output a `<CLARIFICATION_REQUIRED>` block with numbered questions; wait for resolution.

*Last updated: 2026-03-11*
