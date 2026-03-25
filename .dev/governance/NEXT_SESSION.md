# Next Session Prompt — MBO
> Generated: 2026-03-25 | Last commit: fb9e599 | Current version: 0.3.58

---

## Mandate — apply to every task, every step

> **Identify all failure modes in your solution and solve for each one before submitting.**

This applies at every stage — plan, code, review. Do not submit until you have enumerated what can go wrong and addressed each case.

---

## What happened in recent sessions

- v0.3.53 (9e92ba9): Fixed TUI layout cluster BUG-224 through BUG-233
- v0.3.57 (5ebe268): Fixed BUG-238/240/241/242 — session logging, approval gate, DB recovery
- v0.3.58 (96bbd4d): Fixed BUG-243/244 — stop tab switch, pipeline scroll reserved rows

Governance drift: both fix sessions updated code but forgot to update BUGS.md statuses. This has now been corrected (fb9e599). All closed bugs now show FIXED in BUGS.md.

---

## Session log location — READ THIS FIRST

**The session log IS writing.** Location: `/Users/johnserious/MBO_Alpha/.mbo/logs/`

The log captures full pipeline output but contains ANSI escape codes. To read cleanly:
```
cat /Users/johnserious/MBO_Alpha/.mbo/logs/<latest>.log | sed 's/\x1b\[[0-9;]*m//g' | grep "\[session"
```

The operator has been unable to read logs because they were looking in `MBO/.mbo/logs/` — logs only appear in `MBO_Alpha/.mbo/logs/` since that's where mbo actually runs. This distinction must be documented in the TUI (startup message or /help).

---

## Open bugs — fix in this order

### BUG-245 / v0.3.59 — P1 — Session log unreadable (ANSI codes)
The session log writes raw terminal escape codes from Ink's stdout tee. The log is 44MB of ANSI noise. The `_chunkLogger` path (operator chunks written via `writeMeta`) is clean — but the `tee()` approach patches `process.stdout.write` and captures all of Ink's render frames.
- **Fix:** Remove the `tee('stdout')` and `tee('stderr')` calls from `session-log.js`. The `_chunkLogger` in operator.js already captures all meaningful pipeline text cleanly via `writeMeta`. The tee is causing the noise and is redundant.
- **File:** `src/utils/session-log.js`, `src/tui/index.tsx`
- **Acceptance:** Session log is human-readable plain text with no escape codes. Contains all pipeline stage output.

### BUG-246 / v0.3.60 — P1 — 'go' after pipeline error loops back to planning
After a pipeline error (e.g. code_derivation fails), the recommended action says "type 'go' to retry." Typing 'go' re-enters planning from scratch instead of retrying from the failure point.
- **Fix path:** Check `handleApproval` — when called after an error, it may be reading a stale/cleared `pendingDecision` and falling through to `processMessage` which re-classifies from scratch. The error recovery path needs to distinguish retry-after-error from fresh approval.
- **Files:** `src/auth/operator.js` (handleApproval), `src/tui/App.tsx` (error state handling)
- **Acceptance:** Typing 'go' after a pipeline error retries from the failure stage, not from planning.

### BUG-247 / v0.3.61 — P1 — 'stop'/'abort' does nothing
The BUG-243 fix added `setActiveTab(1)` on stop but users report stop still has no effect.
- **Fix path:** Check whether the stop handler in `handleInput` is actually calling `operator.requestAbort()` AND whether `requestAbort` interrupts an in-progress LLM call. The abort may be registered but the pipeline may not check the abort flag during streaming.
- **Files:** `src/tui/App.tsx`, `src/auth/operator.js`
- **Acceptance:** Typing 'stop' or 'abort' halts the pipeline, confirms to the user, and returns to idle.

### BUG-223 / v0.3.38 — P1 — InputBar forward-delete and mid-cursor insert broken (pre-existing)

### BUG-220 / v0.3.35 — P2 — First Ctrl+C no exit prompt
### BUG-218 / v0.2.13 — P2 — mbo bare command no auto-update
### BUG-203 / v0.12.02 — P2 — Graph server not in Cowork sessions

---

## After fixes: governance discipline

**Every fix session MUST before committing:**
1. Update `BUGS.md` status for each fixed bug to `FIXED (vX.Y.ZZ / commit XXXXXXX)`
2. Update `projecttracking.md` task rows to `COMPLETED`
3. Advance `package.json` version to highest resolved task lane
4. Run `mbo alpha` to sync

This has been missed in every session. The TUI task list has been showing closed bugs as open repeatedly. This must stop.

**Next bug number: BUG-248**
**Next task: v0.3.59**
**Auth dir locked — `mbo auth src` before writing `src/auth/`**
