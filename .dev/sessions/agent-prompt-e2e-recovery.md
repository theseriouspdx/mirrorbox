# MBO E2E Recovery & Bug Fix Session
**Date:** 2026-03-19 | **Version:** v0.11.24 | **Target:** clean E2E loop, no fallback paths

---

## CONSTRAINTS — READ FIRST, THESE GOVERN EVERYTHING

- Fix-forward only. No `reset --hard`, no `checkout --`, no destructive git ops.
- Propose before you write. State what you intend to change and wait for "go" — except for
  read-only operations (git status, file reads, validator runs) which need no approval.
- One worktree, one branch. Create a fresh `claude/e2e-bugfix` worktree off `origin/master`.
  Do not touch `MBO_Alpha` directly. Do not reuse any existing recovery/promote worktrees.
- No promotion to master in this session. The session ends at the audit gate.
- If you hit ambiguity you cannot resolve from the files, stop and report. Do not fill gaps
  with plausible-sounding output.
- Never claim a bug is fixed without a log line or test output proving it.

---

## STEP 1 — GOVERNANCE (no code until this is done)

Read in this order:
1. `.dev/governance/AGENTS.md`
2. `.dev/governance/projecttracking.md`
3. `.dev/governance/BUGS.md`

Report:
- Active P0/P1 bugs relevant to the E2E loop
- Current `Next Task` from projecttracking.md
- nhash affirmation per Section 8

---

## STEP 2 — GROUND TRUTH SNAPSHOT (read-only, no approval needed)

Run and report verbatim:
```
git status --short
git worktree list
git branch -vv
git log --oneline -8
```

Note any dirty files in `src/`. Do not explain them away — list them.

---

## STEP 3 — CREATE WORKTREE

```
git -C /Users/johnserious/MBO worktree add \
  /Users/johnserious/MBO_Alpha/.dev/worktree/claude-e2e-bugfix \
  -b claude/e2e-bugfix
```

All remaining work happens inside that worktree. Confirm it exists before proceeding.

---

## STEP 4 — TARGET BUGS

These are the bugs that caused the last E2E to take the easy way out.
Fix them in this worktree. Each fix requires a passing test or log before moving to the next.

### BUG-171 (P1) — "Malformed JSON" vocabulary must be eliminated
**Files:** `src/auth/call-model.js`, `src/auth/operator.js`
**What to do:**
- Grep for: `malformed JSON`, `returned non-JSON`, `produced malformed JSON`,
  `Planner returned malformed output`, `Falling back to minimal safe plan`
- Every occurrence must be removed or replaced with contract-accurate prose
- Reasoning roles (`architecturePlanner`, `componentPlanner`, `reviewer`, `tiebreaker`)
  must flow through labeled-section extraction as the primary path — not JSON parse + recovery
- JSON validation must remain ONLY for machine-required roles (classifier output to internal
  routing, etc.) — not for any reasoning role
- **Acceptance:** `grep -r "malformed JSON\|returned non-JSON\|Planner returned malformed" src/`
  returns zero results

### BUG-172 (P1) — Classifier still hitting BUDGET_EXCEEDED
**File:** `src/auth/operator.js` — `classifyRequest()`
**What to do:**
- Confirm BUG-141 fix is present: context passed to classifier must be `{ userMessage }` only,
  no `sessionHistory`, no `stateSummary`
- If fix is present but 1649 tokens still exceed 1500 budget: raise
  `DEFAULT_TOKEN_BUDGETS.classifier.input` to 2000 (log the tradeoff)
- If fix is absent: apply it now
- **Acceptance:** A simulated classify call with a 200-word userMessage does not emit
  `BUDGET_EXCEEDED`. Add a test or log the token count explicitly.

### BUG-173 (P1) — Ledger generation fails independently
**File:** `src/auth/operator.js` — `generateAssumptionLedger()`, look near line 1608
**What to do:**
- Inspect what is passed as `context` arg — if it includes `sessionHistory` or any unbounded
  field, strip it to the minimum required (classification result + routing decision only)
- **Acceptance:** No `Ledger generation error` or `Ledger generation failed or malformed` in
  E2E transcript

### BUG-174 (P2) — Task label stuck as "Heuristic classification" after completed cycle
**File:** `src/auth/operator.js` — fallback plan exit path, state write on completion
**What to do:**
- Find where the heuristic placeholder string is set and confirm it is overwritten on cycle
  completion
- On any completed cycle (including fallback path), `currentTask` in state must be set to the
  actual user message summary or explicitly cleared — not left as the placeholder
- **Acceptance:** After a completed cycle via fallback, `status` shows a real task description
  or blank, never "Heuristic classification (callModel fallback or placeholder)"

---

## STEP 5 — VERIFICATION GATE

Run in the worktree (not MBO_Alpha root):
```
python3 bin/validator.py --all
npm test
```

Capture both outputs verbatim to:
- `.dev/sessions/audit/validator-e2e-bugfix.txt`
- `.dev/sessions/audit/tests-e2e-bugfix.txt`

Do not summarize. Paste the raw output. If anything fails, fix-forward on the same branch
before calling the gate passed.

---

## STEP 6 — E2E SMOKE RUN

Run the same prompt that exposed the original failures:

```
script -q /dev/null zsh -lc 'MBO_PROJECT_ROOT=/Users/johnserious/MBO_Alpha \
  node /Users/johnserious/MBO_Alpha/bin/mbo.js'
```

Input sequence:
1. `status`
2. `Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.`
3. `go`

Capture log. Verify the following strings are ABSENT from the output:
- `BUDGET_EXCEEDED`
- `returned non-JSON`
- `produced malformed JSON`
- `Planner returned malformed output`
- `Falling back to minimal safe plan`
- `Heuristic classification (callModel fallback or placeholder)` (in status after completion)

If any are present, do not declare success. Fix and rerun.

---

## STEP 7 — AUDIT GATE

Present:
1. Unified diff of all changes (`git diff origin/master`)
2. Validator output (verbatim)
3. Test summary (pass/fail counts)
4. E2E log excerpt showing the five forbidden strings are absent
5. One-paragraph plain-English summary of what changed and why

Then stop. Do not promote to master. Do not merge. Wait for human "go".

---

## KNOWN REPO STATE (as of session start)

- `MBO_Alpha` is on `codex/v0.11.171`, dirty
- Existing worktrees: `MBO_Promote`, `MBO_Recovery`, `MBO_RecoveryClean` — ignore them
- `origin/master` is at `2970c5e` — use this as the base for the new worktree
- Unstaged changes in `MBO_Alpha` include modifications to `src/auth/operator.js`,
  `src/auth/model-router.js`, and several state/relay files — these are Gemini/Codex changes,
  do not carry them forward unless they directly fix a bug in scope

---

## WHAT "DONE" LOOKS LIKE

A clean E2E log where:
- The workflow cycle completes via the real planner path, not the fallback
- No JSON-expectation warning strings appear anywhere
- `status` after completion shows a real task label
- Validator and tests pass
- Audit gate presented and awaiting human approval

That is the only finish line.
