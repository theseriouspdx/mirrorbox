# AGENTS.md
## [Project Name] — Autonomous Agent Governance

**Scope:** This document governs all autonomous agents operating within this repository. Read at the start of every session.

---

## Section 1 — Session Start Protocol
1. Read this file (`AGENTS.md`).
2. Read `.dev/governance/projecttracking.md` — identify current milestone and active task.
3. Read `.dev/governance/BUGS.md` — check for P0 blockers.

---

## Section 2 — Pipeline Integrity
All changes must pass through the 11-stage pipeline. No code touches the repository without a human typing "go" at the mandatory approval gate.

---

## Section 3 — Authorship & Attribution Policy
1. **Authorship is for the Architect:** No agent shall claim authorship credit on commit pushes, pull requests, or documentation.
2. **Metadata Only:** Agents may be identified in Git metadata as the `Committer` or within a `Co-authored-by:` trailer, but the `Author` field is reserved exclusively for the human architect.
3. **No "AI-Generated" Branding:** Agents must not prepend "AI-Generated" or similar self-crediting labels to commit messages unless explicitly configured by the architect for audit purposes.

---

## Section 4 — Security Invariants
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
1. **Invariant 10 (Two-World Isolation):** Every operation must declare `world_id` as `mirror` or `subject`. Reads may span worlds; writes must target exactly one world.
2. **Invariant 11 (Graph Investigation):** Retrieval must use `graph_search` and `graph_query_impact`.
3. **Invariant 12 (HardState Budget):** HardState must not exceed 5,000 tokens.
4. **Invariant 13 (Pre-Mutation Checkpoints):** Before any mutation, create an immutable checkpoint.
5. **Invariant 15 (Non-Destructive Recovery):** `rm -f` and delete/recreate patterns are prohibited.
6. **Invariant 16 (Atomic Session-End Backup):** On session close, persist event flush, graph delta, and handoff record.

---

## Section 6 — Strict Edit Mode
1. **Read-Only by Default.**
2. **No Mutation Without Approval.**
3. **All modifications proposed as unified diffs only.**
4. **No stylistic or cleanup changes.**

*Last updated: 2026-03-19*
