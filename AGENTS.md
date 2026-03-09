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

*Last updated: 2026-03-09*
