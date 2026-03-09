# RE-AUDIT REPORT — Milestone 0.6 (Operator + Session)
**Date:** 2026-03-09
**Auditor:** Claude Code
**Hard State Anchor:** 513
**Prior audit:** 0.6_20260309_ClaudeCode/AUDIT_REPORT.md
**Status:** PASS_WITH_CONDITIONS

---

## Fixes Verified

Both blocking fixes from the prior audit were applied (in a prior session) and confirmed.

| Fix | Verification | Result |
|-----|-------------|--------|
| `operator` role added to `model-router.js` | `routeModels().routingMap.operator` → `{provider:'openrouter', model:'google/gemini-2.0-flash-001'}` | PASS |
| `callModel` wrapped inside try-catch in `classifyRequest` | Source scan confirms `try {` precedes `callModel('classifier'` | PASS |

---

## Full Check Results

| Check | Result |
|-------|--------|
| `callModel('operator')` no longer throws | PASS — routes to `openrouter/gemini-2.0-flash-001` |
| Heuristic fallback reachable on provider failure | PASS — `callModel` inside unified try-catch |
| Tier 0 blocked for non-safelisted files (BUG-004) | PASS — `tier=1` returned |
| HardState within 5,000 token budget | PASS — `tokens=4491` with oversized dangerZones + onboardingProfile |
| `primeDirective` preserved through truncation | PASS |
| `closed_clean` / `closed_with_incident` in session-close script | PASS — Invariant 16 strings present |

---

## Remaining Open Items (non-blocking)

### [Medium] `graphSummary` truncation path unreachable in production
- `operator.js:304`: `graphSummary` is sourced from `this.stateSummary.graphSummary`, which is never populated in the current codebase (always falls to 8-word default ~11 tokens).
- The first truncation branch (`hardState.graphSummary = "[TRUNCATED]"`) cannot fire via the natural runtime path.
- Not blocking: other truncation branches (dangerZones, onboardingProfile) are exercised and hold budget.
- **Action:** File as BUG-039, fix when `stateSummary.graphSummary` is wired to real graph output (likely 0.7+).

### [Medium] PID file not written for default agent name
- `mbo-start.sh:24`: `if [[ "$AGENT" != "operator" ]]` — the PID write is skipped when using the default agent name.
- `mbo-session-close.sh --terminate-mcp --agent=operator` finds no PID file and exits 0 silently.
- **Action:** File as BUG-040. Workaround: always pass `--agent=claude` or `--agent=gemini` explicitly.

### [Deferred to 0.7] Stage 5 `go` gate enforcement
- Valid SPEC requirement. Out of 0.6 scope (DID pipeline lands in 0.7).

### [Deferred to pre-0.8] `world_id` enforcement (Invariant 10)
- Valid invariant. No cross-world write paths exist in 0.6 code. Gate before 0.8.

### [Needs SPEC clarification] Pre-mutation checkpoint (Invariant 13)
- Applying Invariant 13 to event store appends creates recursion ambiguity. Defer pending SPEC clarification.

---

## Verdict

**PASS_WITH_CONDITIONS**
**Confidence: High**

Conditions:
1. BUG-039 and BUG-040 filed in `BUGS.md` before milestone closes.
2. Deferred governance invariants (world_id, Stage 5 gate) entered as pre-0.7 and pre-0.8 gates respectively.
3. Task 0.6-04 (session handoff persistence) completes to close the milestone.

Tasks 0.6-00 through 0.6-03 are structurally sound and safe to close. Milestone 0.6 may proceed to 0.6-04.
