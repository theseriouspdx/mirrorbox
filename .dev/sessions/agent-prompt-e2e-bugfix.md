# MBO E2E Bug Fix Session — BUG-171 through BUG-174
**Repo:** /Users/johnserious/MBO | **Alpha:** /Users/johnserious/MBO_Alpha
**Base:** origin/master (2970c5e) | **Target:** clean E2E loop, no fallback paths

---

## CONSTRAINTS — THESE GOVERN EVERYTHING, READ BEFORE ACTING

- Propose before you write `src/`. State the diff, wait for "go". Read-only ops need no approval.
- One worktree, one branch: `claude/e2e-bugfix` off `origin/master`. Work exclusively inside it.
- Fix-forward only. No `reset --hard`, no `checkout --`, no destructive git ops.
- No promotion to master this session. Session ends at the audit gate — await human "go".
- Never claim a bug is fixed without a log line, test output, or grep result proving it.
- If you hit ambiguity you cannot resolve from the files, stop and report. Do not fill gaps.

---

## STEP 1 — GOVERNANCE (no code until complete)

Read in this order:
1. `.dev/governance/AGENTS.md`
2. `.dev/governance/projecttracking.md`
3. `.dev/governance/BUGS.md`

Report:
- All OPEN P0/P1 bugs
- Current `Next Task` from projecttracking.md
- nhash affirmation per Section 8 of AGENTS.md

---

## STEP 2 — SNAPSHOT (read-only, no approval needed)

Run and report verbatim:
```
git -C /Users/johnserious/MBO status --short
git -C /Users/johnserious/MBO worktree list
git -C /Users/johnserious/MBO branch -vv
git -C /Users/johnserious/MBO log --oneline -6
```

---

## STEP 3 — CREATE WORKTREE

```
git -C /Users/johnserious/MBO worktree add \
  /Users/johnserious/MBO/.dev/worktree/claude-e2e-bugfix \
  -b claude/e2e-bugfix \
  origin/master
```

Confirm it exists and is on a clean tree before proceeding.
All remaining work — reads, patches, verification — happens inside this worktree.

---

## STEP 4 — BUG FIXES

Fix in order. Each fix requires its acceptance criterion met before moving to the next.

### BUG-171 (P1) — Eliminate "malformed JSON" vocabulary from reasoning role paths
**Files:** `src/auth/call-model.js`, `src/auth/operator.js`

What to do:
- Grep for these strings across all of `src/`:
  - `malformed JSON`
  - `returned non-JSON`
  - `produced malformed JSON`
  - `Planner returned malformed output`
  - `Falling back to minimal safe plan`
- For each hit: determine if it's in a reasoning role path (architecturePlanner, componentPlanner,
  reviewer, tiebreaker) or a machine-required role path (classifier, router)
- Reasoning role paths: replace JSON validation + NL recovery with labeled-section extraction
  as the primary path. These roles have a prose contract. JSON parse should not be attempted.
- Machine-required paths: keep strict JSON validation — do not touch
- Update any fallback warning strings to contract-accurate language (e.g. "section extraction
  incomplete" not "malformed JSON")

**Acceptance:** `grep -r "malformed JSON\|returned non-JSON\|Planner returned malformed\|Falling back to minimal safe plan" src/` returns zero results.

---

### BUG-172 (P1) — Classifier BUDGET_EXCEEDED still firing post-BUG-141 fix
**File:** `src/auth/operator.js` — `classifyRequest()`

What to do:
- Verify the BUG-141 fix is present: context passed to classifier must be `{ userMessage }` only.
  No `sessionHistory`. No `stateSummary`. No unbounded fields.
- If fix is absent: apply it.
- If fix is present but tokens still exceed budget on a normal-length message: raise
  `DEFAULT_TOKEN_BUDGETS.classifier.input` from 1500 to 2000. Log the tradeoff inline.
- Do not re-add any session history to the classifier context under any circumstances.

**Acceptance:** A classify call with a message of typical length (~150 words) does not emit
`BUDGET_EXCEEDED`. Confirm with a log line showing actual token count vs budget.

---

### BUG-173 (P1) — Ledger generation fails — generateAssumptionLedger context too wide
**File:** `src/auth/operator.js` — `generateAssumptionLedger()` (~line 1608)

What to do:
- Inspect the context object passed into the ledger model call
- If it includes `sessionHistory`, raw context, or any unbounded field: strip to minimum
  required (classification result + routing decision only)
- Apply same budget discipline as BUG-172 fix: confirm ledger call fits within its budget

**Acceptance:** No `Ledger generation error` or `Ledger generation failed or malformed` in
E2E transcript.

---

### BUG-174 (P2) — Task label stuck as "Heuristic classification" after completed cycle
**File:** `src/auth/operator.js` — fallback plan exit path, state write on completion

What to do:
- Find where `currentTask` or equivalent task label is set to the heuristic placeholder string
- Confirm it is overwritten on cycle completion — including the fallback path
- On any completed cycle, task label must reflect the actual user message summary, or be
  explicitly cleared to empty — never left as "Heuristic classification (callModel fallback
  or placeholder)"

**Acceptance:** After a completed cycle via any path, `status` output does not contain
"Heuristic classification (callModel fallback or placeholder)".

---

## STEP 5 — VERIFICATION GATE

Run from inside the worktree:
```
python3 bin/validator.py --all
npm test
```

Save verbatim output to:
- `.dev/sessions/audit/validator-e2e-bugfix.txt`
- `.dev/sessions/audit/tests-e2e-bugfix.txt`

Do not summarize. Raw output only. Fix-forward if anything fails — do not declare gate passed
until both commands exit clean.

---

## STEP 6 — E2E SMOKE RUN

```
script -q /dev/null zsh -lc \
  'MBO_PROJECT_ROOT=/Users/johnserious/MBO_Alpha node /Users/johnserious/MBO_Alpha/bin/mbo.js'
```

Input sequence:
1. `status`
2. `Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.`
3. `go`

Save log to `.dev/sessions/audit/e2e-bugfix.log`

Verify these strings are ABSENT from the full log output:
- `BUDGET_EXCEEDED`
- `returned non-JSON`
- `produced malformed JSON`
- `Planner returned malformed output`
- `Falling back to minimal safe plan`
- `Heuristic classification (callModel fallback or placeholder)` (in status after completion)

If any are present: fix-forward on the same branch and rerun. Do not declare success until
all six are absent.

---

## STEP 7 — AUDIT GATE (stop here, await human "go")

Present:
1. `git diff origin/master` — unified diff of all changes
2. Validator output (verbatim, or path to file)
3. Test summary — pass/fail counts
4. E2E log grep confirming all six forbidden strings are absent
5. One paragraph: what changed, why, any tradeoffs logged

Then stop. Do not merge. Do not promote. Wait for human "go".

---

## KNOWN STATE ENTERING THIS SESSION

- Repo is clean: two worktrees only (MBO on master, MBO_Alpha on codex/v0.11.171)
- All prior recovery/promote worktrees and branches removed
- BUG-171 through BUG-174 are logged in `.dev/governance/BUGS.md`
- Next bug number: BUG-175
- `codex/v0.11.171` contains today's governance updates — do not base the new worktree on it;
  base off `origin/master` only

---

## THE ONLY FINISH LINE

A clean E2E log where:
- The workflow cycle completes via the real planner path, not a fallback
- All six forbidden strings are absent
- `status` after completion shows a real task label
- Validator and tests pass clean
- Audit gate presented and awaiting human approval
