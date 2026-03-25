# Next Session Prompt — MBO
> Generated: 2026-03-24 | Last commit: b767b25

---

## Mandate — apply to every task, every step

> **Identify all failure modes in your solution and solve for each one before submitting.**

This applies at every stage: reading the problem, forming a plan, writing code, and reviewing the result. Do not submit a fix until you have enumerated what can go wrong with it and addressed each case.

---

## What happened this session

Fixed a cluster of 9 TUI layout bugs (BUG-224 through BUG-233) in commit `9e92ba9` (v0.3.53). Operator smoke-tested and found 5 regressions. All governance docs updated, resolved bugs archived to BUGS-resolved.md, and BUGS.md statuses reconciled so the TUI task list is accurate.

---

## Your first tasks: P0 regressions — fix before anything else

**Next Task: v0.3.56** (per projecttracking.md)

Fix BUG-241 and BUG-242 together — same root cause:

### BUG-241 / v0.3.56 — P0 — Silent approval gate (no 'go' prompt)
After plan convergence the panel shows nothing. User doesn't know to type 'go'.
- **Root cause:** BUG-231 (commit 9e92ba9) added shimmer when `pipelineRunning && !hasContent`. If `_pipelineRunning` is still true at the needsApproval gate, shimmer fires instead of the 'go' hint.
- **Fix path:** Read `git diff src/auth/operator.js` first. Confirm `activateTask` sets `_pipelineRunning = false` before returning `needsApproval`. Confirm App.tsx `handleInput` exempts `go` from the `_pipelineRunning` guard.

### BUG-242 / v0.3.57 — P0 — 'go' sends back to planning instead of executing
Typing 'go' re-enters planning rather than advancing to Stage 5.
- **Fix path:** Same investigation as BUG-241. Also verify `handleApproval` advances pipeline state rather than re-planning.

### BUG-238 / v0.11.195 — P0 — Pipeline returns raw JSON
Operator panel shows raw JSON blobs instead of formatted stage output.
- **Root cause:** `mirrorbox.db` is missing — only `mirrorbox.db.corrupt.1774404364247` exists. State manager failing to init; pipeline serializes the error as JSON.
- **Fix path:** Check db-manager.js startup. Add recovery/reinit for corrupt/missing db. Also verify OperatorPanel isn't stringifying an error object.

---

## P1 bugs (fix before milestone complete)

### BUG-239 / v0.3.54 — PipelinePanel (Tab 2) not scrollable
Scroll wiring broke when BUG-227 removed the stage-box block in PipelinePanel.tsx. Restore `useInput` scroll handler connection to scroll offset state.

### BUG-240 / v0.3.55 — Session log not written
TUI pipeline runs produce no log file under `.mbo/logs/`. Likely tied to db corruption (BUG-238) — fix db first, then verify log write path.

### BUG-223 / v0.3.38 — InputBar forward-delete and mid-cursor insert broken
`ink-text-input@6.0.0` limitation. Forward Delete does nothing; mid-cursor insert misplaces characters. Fix: patch library, replace with custom component, or upgrade.

---

## P2 bugs (deferred)

- **BUG-220 / v0.3.35** — First Ctrl+C shows no "press again to exit" feedback
- **BUG-218 / v0.2.13** — `mbo` bare command has no auto-update check
- **BUG-203 / v0.12.02** — Graph server not registered in Cowork sessions

---

## Critical context — READ BEFORE TOUCHING operator.js

`src/auth/operator.js` has **uncommitted working-tree changes** that include the BUG-236 fix. These ARE deployed via `mbo alpha` but are NOT in git history.

1. Run `git diff src/auth/operator.js` before writing anything
2. Do NOT lose the BUG-236 fix (`_pipelineRunning = false` before returning `needsApproval`)
3. `src/auth/` is locked (444) — run `mbo auth src` before any write

---

## After fixes: version and deploy

1. Advance `package.json` to the highest resolved task version (will be `0.3.57` if all five P0/P1s are fixed)
2. Commit with proper dual BUG-### / vX.Y.ZZ labels
3. Run `mbo alpha` to sync to the runtime
4. Confirm version in TUI StatusBar matches — operator cannot verify build currency without this

---

## Reconciled open bug list (what the TUI should now show)

| ID | Lane | Sev | Summary |
|----|------|-----|---------|
| BUG-242 | v0.3.57 | P0 | 'go' re-enters planning |
| BUG-241 | v0.3.56 | P0 | Silent approval gate |
| BUG-238 | v0.11.195 | P0 | Raw JSON output / missing db |
| BUG-240 | v0.3.55 | P1 | Session log not written |
| BUG-239 | v0.3.54 | P1 | PipelinePanel not scrollable |
| BUG-223 | v0.3.38 | P1 | InputBar forward-delete / mid-cursor broken |
| BUG-220 | v0.3.35 | P2 | Ctrl+C no exit prompt |
| BUG-218 | v0.2.13 | P2 | mbo bare command no auto-update |
| BUG-203 | v0.12.02 | P2 | Graph server not in Cowork |

BUG-224 through BUG-233 are FIXED (v0.3.53 / 9e92ba9) and should no longer appear.

---

## Governance reminders

- Assumption ledger required before planning (entropy gate < 10)
- Blast radius check before every change
- `src/auth/` locked — `mbo auth src` required before writes
- **Next bug number: BUG-243**
- All governance files (`.dev/governance/`) are always writable
