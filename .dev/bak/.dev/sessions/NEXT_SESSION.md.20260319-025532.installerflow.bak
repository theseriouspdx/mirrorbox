# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** 2026-03-18
**Last task:** v0.11.36: Workflow canonicalization and validator enforcement (IN_PROGRESS)
**Status:** Task Pending

---

## Section 1 — Next Action

**Task v0.11.86 — BUG-086 root-mismatch re-onboarding validation round 2**

- Status: IN_PROGRESS
- Linked P0/P1 blockers:
- BUG-086: profile root mismatch handling must be validated in runtime loop without breaking status-only onboarding checks.

**Graph queries to run at Gate 0:**
```
graph_search("BUG-086 root mismatch re-onboarding validation round 2")
graph_search("v0.11.36 e2e workflow completion MBO_Alpha planner reviewer fallback")
```

---

## Section 2 — Session Summary

- Created dedicated worktree branch: `codex/e2e-20260318-212502`.
- Full transcript logging file used: `/Users/johnserious/MBO/.dev/sessions/TRANSCRIPT_E2E_20260318_212550.log`.
- Refreshed `/Users/johnserious/MBO_Alpha` from `/Users/johnserious/MBO` (stable source), then synced patched files from worktree for runtime validation.
- Implemented and synced these runtime changes:
  - `src/auth/model-router.js`: provider normalization + legacy config harmonization (`claude-cli`, `google`, `anthropic`, `ollama`) and safer fallbacks.
  - `src/auth/call-model.js`: explicit CLI binary guard.
  - `src/index.js`: continuous `[ALIVE]` progress indicator while pipeline is running.
  - `scripts/mbo-session-close.sh`: default incremental refresh; rebuild only when forced.
  - `src/cli/onboarding.js`: `checkOnboarding(projectRoot, options)` now supports `{ autoRun, returnStatus }` and no longer forces onboarding when status-only check is requested.
  - `src/auth/operator.js`: reviewer parse fallback hardening; MCP session-id capture/reuse + initialize-on-400 recovery path; assumption-ledger fallback softening; planner malformed-output fallback path partially improved.
  - `bin/mbo.js`: suppress noisy `ps: etimes` stderr by redirecting `ps` stderr in helper reaper.
- Current E2E status:
  - Verified: no raw JSON surfaced in normal operator conversation.
  - Verified: continuous alive progress appears during long stages.
  - Verified: session-close defaults to incremental path (no forced rebuild).
  - Not yet verified: one complete end-to-end workflow cycle to audit approval/sync without fallback failure.

---

## Section 3 — Immediate Runbook (Next Session)

1. Start from `/tmp/mbo_alpha_runctx` (or another external cwd), always with `MBO_PROJECT_ROOT=/Users/johnserious/MBO_Alpha`.
2. Run MCP recovery first:
   - `MBO_PROJECT_ROOT=/Users/johnserious/MBO_Alpha node /Users/johnserious/MBO_Alpha/bin/mbo.js mcp`
3. Start runtime:
   - `MBO_PROJECT_ROOT=/Users/johnserious/MBO_Alpha node /Users/johnserious/MBO_Alpha/bin/mbo.js`
4. Send exactly:
   - `Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.`
   - `go`
   - `approved`
   - `status`
5. If stage stalls or loops, prioritize `src/auth/operator.js` planner/reviewer fallback completion (no infinite retries; always keep operator in NL control).
6. Append all command output to the existing transcript path above.

---

## Session End Checklist
- Branch: `codex/e2e-20260318-212502`
- Transcript: `/Users/johnserious/MBO/.dev/sessions/TRANSCRIPT_E2E_20260318_212550.log`
- Governance updated: `projecttracking.md` row for v0.11.36 updated with current scope and blockers.
