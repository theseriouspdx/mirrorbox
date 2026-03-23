## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-194
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / vX.Y.ZZ`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use `0.11.x` for milestone-1.1 hardening, cleanup, backports, and stabilization of existing runtime/onboarding/bootstrap behavior; `0.12.x` for new graph/runtime intelligence functionality such as graph-server refinement, metadata/context assembly, and knowledge-pack behavior; `0.2.x` for scripting/audit/automation; `0.3.x` for TUI/operator UX; `0.4.x` for multithreading/concurrency. When uncertain, check `.dev/governance/AGENTS.md` Section 17A.1 before assigning the bug's `vX.Y.ZZ` tag.

---
### BUG-187 / v0.2.05: Tokenmiser semantics are unresolved and require user interview before implementation | Milestone: 1.1 | OPEN
- **Location:** `src/state/db-manager.js`, `src/cli/tokenmiser-dashboard.js`, `src/tui/components/StatsOverlay.tsx`, related Tokenmiser/operator displays
- **Severity:** P1
- **Status:** OPEN — 2026-03-21
- **Task:** v0.2.05
- **Description:** Tokenmiser behavior is not aligned with the operator's intended semantics, and prior discussion already looped without reaching shared understanding. The current display shows values that appear misleading or inconsistent, including counterfactual/savings output and unexpectedly high token counts after only a few prompts.
- **Related Prior Work:** `BUG-155` previously addressed Tokenmiser costing drift, but the current issue should be treated as a new bug/regression/behavior-definition failure rather than mutating the resolved record.
- **Hard Gate:** No implementation may begin until the agent interviews the user about the desired Tokenmiser behavior, compares expected behavior against actual behavior, and writes down the mismatch clearly enough that assumptions are explicit.
- **Evidence:** Current Tokenmiser output appears behaviorally wrong or at least unexplained to the operator, including negative/odd savings presentation and token totals that do not feel proportionate to the small number of prompts issued.
- **Acceptance:** Tokenmiser must use a single, explainable source of truth for token counts and cost math. The final implementation must include a documented expectation-vs-actual reconciliation derived from a user interview before code changes proceed.
