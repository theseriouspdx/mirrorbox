# E2E Audit Notes — 2026-03-19 (resume session)

Transcript reviewed:
- `/Users/johnserious/MBO_Alpha/.mbo/logs/mbo-e2e-20260319-011906.log` (failed rerun)
- Prior clean transcript: `mbo-e2e-20260319-002908.log`

## Failure Signature (mbo-e2e-20260319-011906.log)

1. `[BUDGET_EXCEEDED] Input tokens (1667) exceed budget (1500) for role classifier` — fires on initial classification
2. `[Operator] Ledger generation error: [Operator] Ledger generation failed or malformed.` — ledger classifier also hit budget pressure (passes `{ classification, routing, context }`)
3. After `go`: planner section reconciliation fell through to conservative readiness-check workflow fallback
4. Ended at audit approval prompt without completing a clean full cycle

## Root Cause Analysis

**Primary blocker (BUG-141):** `classifyRequest()` was passing `sessionHistory` + `stateSummary` into classifier context. After even one prior turn, session history alone exceeds the 1500-token classifier budget. This was not an MCP overload issue — it was a context-scoping mistake.

**Secondary blocker:** Ledger classifier (`generateAssumptionLedger`) passes `{ classification, routing, context }` — `context` arg may include session history depending on caller. Not fixed in this session; monitor in next Alpha run.

**Planner fallback:** `_extractDecision` for `architecturePlanner`/`componentPlanner` is correctly implemented and will return a valid object for any non-empty prose response. The planner fallback observed in the log was downstream of the classifier failure, not an independent bug. If classifier now succeeds, planner should reach reconciliation cleanly.

## Changes Made This Session

### `src/auth/operator.js`
- `classifyRequest()`: stripped context to `{ userMessage }` only (BUG-141 fix)
- All prior NL-first patches from previous session remain intact

### `.dev/governance/BUGS.md`
- Logged BUG-141 (classifier budget/context) with fix, tradeoff, and acceptance criteria
- Logged BUG-142 (worktree auth/bootstrap) with fix summary

### `.dev/governance/projecttracking.md`
- Added BUG-141, BUG-142 to v0.11.36 links column

## Syntax Checks Passed
- `node --check src/auth/operator.js` — OK

## What Still Needs to Happen

1. **Sync to Alpha** (pending user authorization):
   - `src/auth/operator.js` only — the only file changed in this session
   - Preserve existing Alpha transcripts before sync

2. **Run fresh Alpha E2E** outside sandbox via:
   ```
   script -q /dev/null zsh -lc 'MBO_PROJECT_ROOT=/Users/johnserious/MBO_Alpha node /Users/johnserious/MBO_Alpha/bin/mbo.js'
   ```
   Input sequence:
   - `status`
   - `Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.`
   - `go`

3. **Verify new log does NOT contain:**
   - `BUDGET_EXCEEDED`
   - `returned non-JSON`
   - `produced malformed JSON`
   - `Planner returned malformed output`
   - `fallback to minimal safe plan`
   - `Switching to the conservative readiness-check workflow`

4. **If ledger classifier also hits budget:** investigate `generateAssumptionLedger` context arg at line ~1608 — may need same context-strip treatment

## Known Tradeoff Logged
Classifier context strip (BUG-141): classifier no longer sees session history. If contextual re-classification on follow-up messages is ever needed, raise `DEFAULT_TOKEN_BUDGETS.classifier.input` first, measure, then selectively re-add context. Do not re-add raw sessionHistory.
