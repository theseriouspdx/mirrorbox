# Next Session Prompt — MBO
> Generated: 2026-03-25 | Last commit: 07a1067 | Current version: 0.3.59

---

## Mandate — apply to every task, every step

> **Identify all failure modes in your solution and solve for each one before submitting.**

This applies at every stage — plan, code, review. Do not submit until you have enumerated what can go wrong and addressed each case.

---

## FIRST TASK — Read the logs before touching any code

**Do not write code, bump versions, or mark bugs fixed until you have read the logs and reported findings to the operator.**

### Step 1 — Find the freshest log

```bash
ls -lt /Users/johnserious/MBO_Alpha/.mbo/logs/ | head -6
```

The most recent file is the operator's clean 0.3.59 smoke test. Read it in full:

```bash
cat /Users/johnserious/MBO_Alpha/.mbo/logs/<latest>.log | sed 's/\x1b\[[0-9;]*m//g'
```

### Step 2 — Reference log (before fix, with ANSI noise)

```
/Users/johnserious/MBO_Alpha/.mbo/logs/session-2026-03-25-09-26-58-tui-f0670b10-556.log
```
This is v0.3.58 with `tee('stdout')` — the noisy baseline.

### Step 3 — Report to operator before proceeding

From the fresh log, answer:

1. **BUG-245 confirmed?** Is the log human-readable with no ANSI render frames? What's the file size vs the 40KB baseline?
2. **BUG-246 visible?** Does the log show a pipeline run reaching approval/`go`, then looping back to planning instead of executing? Note the exact log lines.
3. **BUG-247 visible?** Does the log show a stop/abort command being sent but the pipeline continuing?
4. **JSON regression visible?** Does the log show raw JSON being returned to the user at any stage?
5. **Any other anomalies?** New errors, unexpected restarts, missing output, etc.

Present findings to the operator as a numbered list with direct log line quotes. Then wait for direction before writing any code.

---

## What happened in recent sessions

- v0.3.53 (9e92ba9): Fixed TUI layout cluster BUG-224 through BUG-233
- v0.3.57 (5ebe268): Fixed BUG-238/240/241/242 — session logging, approval gate, DB recovery
- v0.3.58 (96bbd4d): Fixed BUG-243/244 — stop tab switch, pipeline scroll reserved rows
- v0.3.59 (64d4a1f): Fixed BUG-245 — removed `tee('stdout')` from session-log.js, eliminating 60MB ANSI log bloat

Governance drift note: multiple sessions fixed code but skipped BUGS.md/projecttracking.md updates. This was corrected in fb9e599. Do not repeat this.

---

## Open bugs (priority order)

### BUG-246 / v0.3.60 — P1 — 'go' after pipeline error loops back to planning
After a pipeline error, TUI shows "[RECOMMENDED ACTION]: type 'go' to retry." Typing 'go' re-enters planning from scratch.
- **Root cause:** error recovery path does not set `waitingForApproval`, so 'go' falls through to `processMessage` which re-classifies from scratch.
- **Files:** `src/tui/App.tsx` (error state / handleApproval), `src/auth/operator.js` (handleApproval)
- **Acceptance:** 'go' after error retries from failure stage, not from planning.

### BUG-247 / v0.3.61 — P1 — 'stop'/'abort' does nothing
Users report stop/abort has no visible effect. Pipeline continues.
- **Root cause likely:** `requestAbort()` sets a flag but pipeline does not check flag during in-progress LLM streaming call.
- **Files:** `src/tui/App.tsx`, `src/auth/operator.js`
- **Acceptance:** stop/abort halts pipeline, confirms to user, returns to idle.

### BUG-223 / v0.3.38 — P1 — InputBar forward-delete and mid-cursor insert broken (pre-existing)

### BUG-220 / v0.3.35 — P2 — First Ctrl+C no exit prompt
### BUG-218 / v0.2.13 — P2 — mbo bare command no auto-update
### BUG-203 / v0.12.02 — P2 — Graph server not in Cowork sessions

---

## Governance discipline — do this before every commit

1. Update `BUGS.md` status for each fixed bug: `FIXED (vX.Y.ZZ / commit XXXXXXX)`
2. Update `projecttracking.md` task rows to `COMPLETED`
3. Advance `package.json` version per lane
4. Run `mbo alpha` to sync
5. Verify version shows correctly in TUI header

**Next bug number: BUG-248**
**Next task: v0.3.60**
**Auth dir locked — run `mbo auth src` before writing anything in `src/auth/`**
