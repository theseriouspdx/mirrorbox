## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-200
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / vX.Y.ZZ`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use `0.11.x` for milestone-1.1 hardening, cleanup, backports, and stabilization of existing runtime/onboarding/bootstrap behavior; `0.12.x` for new graph/runtime intelligence functionality such as graph-server refinement, metadata/context assembly, and knowledge-pack behavior; `0.2.x` for scripting/audit/automation; `0.3.x` for TUI/operator UX; `0.4.x` for multithreading/concurrency. When uncertain, check `.dev/governance/AGENTS.md` Section 17A.1 before assigning the bug's `vX.Y.ZZ` tag.

---

### BUG-199 / v0.2.08 — Output-Contract hardening: Log interleaving and entropy-score fudge factor
**Severity:** P1
**Status:** OPEN
**Task:** v0.2.08
**Found:** 2026-03-24 (Audit Analysis v0.2.04)
**Description:** 
1. **Log Interleaving:** Concurrent streaming from `architecturePlanner` and `componentPlanner` in Stage 3 causes "word salad" in E2E transcripts, making the DID rationale unreadable. 
2. **Entropy Discrepancy:** Subject run reported `ENTROPY SCORE: 15.0` in the raw log but the system summary reported `Entropy Score: 10`, allowing a task that should have hit a Hard Stop to proceed. 
3. **Status Bleed:** `[OPERATOR]` and `[classifier]` labels occasionally bleed into parsed assumption ID/Category fields.
**Acceptance:** 
- Planner streams are emitted sequentially in the log (buffering if necessary).
- System-calculated entropy score matches the raw log value exactly (no rounding/fudging).
- Assumption parser reliably strips status labels before splitting.


