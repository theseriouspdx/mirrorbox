# Next Session Prompt — MBO
> Generated: 2026-03-24 | Last commit: 9e92ba9

---

## What happened this session

We fixed a cluster of 9 TUI layout bugs (BUG-224 through BUG-233) in commit `9e92ba9` (v0.3.53), covering OperatorPanel height, StatsPanel colors/sizing, PipelinePanel stage-box removal, StatusBar dynamic width, TabBar truncation, SessionSavingsBar, a shimmer thinking indicator, and the numbered shortcuts regression.

The operator smoke-tested v0.3.53 and found 5 regressions. All are logged in BUGS.md and projecttracking.md.

---

## Your first task: fix the P0 regressions

**Next Task: v0.3.56** (per projecttracking.md)

Tackle in this order — 241/242 are the same root cause, fix together:

### 1. BUG-241 / v0.3.56 — P0 — Silent approval gate (no 'go' prompt)
After plan convergence the operator panel shows nothing. User doesn't know to type 'go'.
- **Root cause:** BUG-231 (commit 9e92ba9) added shimmer when `pipelineRunning && !hasContent`. If `_pipelineRunning` is still true at the needsApproval gate, shimmer fires instead of the 'go' hint.
- **Fix path:** Verify BUG-236 fix is in operator.js working tree (`git diff src/auth/operator.js`). Confirm `activateTask` sets `_pipelineRunning = false` before returning `needsApproval`. Confirm App.tsx `handleInput` exempts 'go' from the `_pipelineRunning` guard.

### 2. BUG-242 / v0.3.57 — P0 — 'go' sends back to planning instead of executing
Typing 'go' re-enters planning rather than advancing to Stage 5.
- **Fix path:** Same investigation as BUG-241. Also check `handleApproval` — confirm it reads and advances the pipeline state rather than re-planning.

### 3. BUG-238 / v0.11.195 — P0 — Pipeline returns raw JSON
Operator panel shows raw JSON blobs instead of formatted stage output.
- **Root cause:** `mirrorbox.db` is missing from `.mbo/` — only `mirrorbox.db.corrupt.1774404364247` exists. State manager likely failing to init; pipeline catches the error and serializes it as JSON.
- **Fix path:** Check db-manager.js startup path. Add recovery/reinit logic for corrupt/missing db. Also verify OperatorPanel lines rendering isn't stringifying an array or error object.

### 4. BUG-239 / v0.3.54 — P1 — PipelinePanel (Tab 2) not scrollable
After BUG-227 removed the redundant stage boxes, scroll wiring in PipelinePanel broke.
- **Fix path:** Restore `useInput` scroll handler connection to scroll offset state in PipelinePanel.tsx.

### 5. BUG-240 / v0.3.55 — P1 — Session log not written
TUI pipeline runs produce no log file under `.mbo/logs/`.
- **Fix path:** Likely tied to BUG-238 db corruption. Once db is fixed, re-verify log write path.

---

## Critical context — READ BEFORE TOUCHING operator.js

`src/auth/operator.js` has **uncommitted working-tree changes** that include the BUG-236 fix. These changes ARE deployed (mbo alpha syncs the working tree), but they are NOT in git history.

**Before writing anything to operator.js:**
1. Run `git diff src/auth/operator.js` to read the full diff
2. Do NOT lose the BUG-236 fix
3. `src/auth/` is locked (444) — run `mbo auth src` before writing

---

## After fixes: version and deploy

1. Advance `package.json` version to the highest resolved task lane (will be `0.3.57` if all five are fixed, or the highest completed)
2. Commit with proper dual BUG-### / vX.Y.ZZ labels
3. Run `mbo alpha` to sync to the runtime
4. Confirm the version shown in the TUI StatusBar matches the commit

The operator cannot verify build currency without a visible version bump. This was a problem this session.

---

## Open bug queue after this session (from BUGS.md)

| ID | Lane | Sev | Summary |
|----|------|-----|---------|
| BUG-242 | v0.3.57 | P0 | 'go' re-enters planning |
| BUG-241 | v0.3.56 | P0 | Silent approval gate |
| BUG-238 | v0.11.195 | P0 | Raw JSON output / missing db |
| BUG-239 | v0.3.54 | P1 | PipelinePanel not scrollable |
| BUG-240 | v0.3.55 | P1 | Session log not written |
| BUG-223 | v0.3.38 | P1 | InputBar forward-delete / mid-cursor insert broken |
| BUG-224–233 | v0.3.x | — | FIXED in 9e92ba9 — archived in BUGS-resolved.md |

After clearing the P0s, next unblocked task in the READY queue is **v0.13.02** (config missing roles).

---

## Governance reminders

- Assumption ledger required before planning (entropy gate < 10)
- Blast radius check before every change
- `src/auth/` is locked — `mbo auth src` required before writes
- Next bug number: **BUG-243**
- All governance files (`.dev/governance/`) are always writable
