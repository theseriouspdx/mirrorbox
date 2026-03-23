## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-197
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / vX.Y.ZZ`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use `0.11.x` for milestone-1.1 hardening, cleanup, backports, and stabilization of existing runtime/onboarding/bootstrap behavior; `0.12.x` for new graph/runtime intelligence functionality such as graph-server refinement, metadata/context assembly, and knowledge-pack behavior; `0.2.x` for scripting/audit/automation; `0.3.x` for TUI/operator UX; `0.4.x` for multithreading/concurrency. When uncertain, check `.dev/governance/AGENTS.md` Section 17A.1 before assigning the bug's `vX.Y.ZZ` tag.

---

### BUG-196 / v0.3.23: `handleInput` arrow function body closes prematurely — esbuild `Expected ")" but found "if"` at line 431 | Milestone: 1.1 | RESOLVED
- **Location:** `src/tui/App.tsx` — `handleInput` `useCallback` body
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-23
- **Task:** v0.3.23
- **Description:** The audit-gate branch (approved/reject handling + fallback) was missing its outer `if (auditPending || operator.stateSummary?.pendingAudit)` guard. The closing `}` at line 429 was correct for that outer guard but the opening was absent, causing the arrow function body to close at line 429 instead of line 452. Lines 431–451 (hint-mode check and main `processMessage` call) were outside the function body but inside the `useCallback(` parenthesis, making esbuild report `Expected ")" but found "if"` at line 431. Discovered during e2e sync-and-run.
- **Fix:** Inserted `if (auditPending || operator.stateSummary?.pendingAudit) {` before the `approved` branch in `handleInput`. Function body now correctly closes at line 453 on the `}, [deps])` of `useCallback`.

### BUG-195 / v0.11.188: Assumption ledger sign-off can be bypassed for Tier 0 and read-only workflows | Milestone: 1.1 | RESOLVED
- **Location:** `src/auth/operator.js` — `processMessage()` / classification normalization / Stage 1.5 gate entry
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-23
- **Task:** v0.11.188
- **Description:** The runtime only enforced the assumption-ledger pause when Stage 1.5 entropy exceeded 10 or when routing tier was above 0. Tier 0 flows and `readOnlyWorkflow` readiness-check requests could bypass assumption review and proceed to planning without explicit human sign-off.
- **Fix:** Normalized readiness-check requests into an explicit read-only workflow classification, removed the direct read-only bypass, and routed every execution workflow through Stage 1.5 before planning. Added targeted test coverage proving Tier 0 and read-only workflows now emit the spec-refinement gate and require `go`.
