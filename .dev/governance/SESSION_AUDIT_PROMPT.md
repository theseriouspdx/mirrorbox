# SESSION_AUDIT_PROMPT.md
## MBO — Guided Session Start, Smoke Test & Bug Capture
> Paste the **Session Start Block** at the top of any new session (any agent or solo).
> Work through Phases 1–5 in order. Do not skip Phase 1 — every other phase depends on it.

---

## ▶ Session Start Block (paste this first, every time)

```
Read .dev/governance/AGENTS.md and .dev/governance/SESSION_AUDIT_PROMPT.md.
Then run:
  node scripts/graph_call.js graph_server_info
  git log --oneline -5
  head -40 .dev/governance/projecttracking.md
  tail -20 .dev/governance/BUGS.md

Confirm: graph index age < 1h, scanning = false.
Report: last 5 commits, current `Next Task`, active blockers, and one-paragraph summary of what we are doing today.
Do not start any implementation until you have confirmed graph is fresh and summarised the situation.
```

---

## Phase 1 — Orient (5 minutes, no exceptions)

### 1A. Graph health
```bash
node scripts/graph_call.js graph_server_info
```
Required output: `is_scanning: false` and `lastIndexed` within the last hour.
If stale: `mbo mcp start` then wait 10 s and retry.

### 1B. Last session's work
```bash
git log --oneline -8
git diff HEAD~1 --stat          # what the last commit actually changed
```
Compare against the current top of `projecttracking.md` and any linked bugs — did everything that was supposed to happen actually land?

### 1C. Current task state
```bash
head -40 .dev/governance/projecttracking.md
tail -10 .dev/governance/BUGS.md
```
Note:
- Next task ID (from projecttracking.md `Next Task:` field)
- Next bug number (from BUGS.md tail)
- Any task rows or bug entries that still depend on handoff-only context

### 1D. Verify last session's commit claims
For each commit since the last session start, read the changed files and confirm the
commit message accurately describes what changed. Flag any mismatch as a `SESSION_DRIFT`
item and note it at the top of today's session report.

---

## Phase 2 — Smoke Test Last Session's Work

For each task completed in the last session, run the verification steps below.
Capture every failure as a bug (Phase 4 format).

### 2A. Syntax check all changed auth files
```bash
for f in src/auth/*.js; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
```
Expected: all OK. Any FAIL is BUG-### P0.

### 2B. Config roles — v0.13.02 verification
```bash
cat ~/.mbo/config.json | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
required = ['classifier','architecturePlanner','componentPlanner',
            'reviewer','patchGenerator','tiebreaker','onboarding','operator']
missing = [r for r in required if r not in cfg]
print('MISSING:', missing or 'none')
print('PRESENT:', [r for r in required if r in cfg])
"
```
Expected: MISSING: none. Any missing role = P0 regression on v0.13.02.

### 2C. DID Gate 2 — v0.14.02 verification
```bash
grep -n "buildGate2BlindPrompt\|buildGate2ComparePrompt\|_runGate2\|gate2ProtectedHashes\|DID_GATE2_BLIND" \
  src/auth/did-orchestrator.js src/auth/did-prompts.js | wc -l
```
Expected: ≥ 8 hits. Zero hits = Gate 2 was not committed.

```bash
# Confirm blind isolation is called before Gate 2 reviewer prompt
grep -n "gate2ProtectedHashes\|computeContentHashes(plannerRaw)" src/auth/did-orchestrator.js
```
Expected: protectedHashes passed into Gate 2 callModel as 5th argument.

### 2D. Context isolation — v0.14.03 verification
```bash
# Dialogue rounds (plannerR2, reviewerR2) must be gone from run()
grep -n "plannerR2\|PLANNER REVIEW\]\|REVIEWER ROUND 2\]\|reviewerR2" src/auth/did-orchestrator.js
```
Expected: zero matches (or only in comments). Any live code match = isolation regression.

```bash
# Gate 1 divergence must route directly to tiebreaker
grep -n "_runGate1Tiebreaker\|_runStage4A" src/auth/did-orchestrator.js
```
Expected: both methods present.

### 2E. Stage 4.5 dry run — v0.14.04 verification
```bash
grep -n "node.*--check\|validator\.py\|npm.*test\|rollback\|finally" src/auth/operator.js \
  | grep -A2 -B2 "runStage4_5" | head -20
```
Expected: `node --check`, `validator.py`, `npm`, and `finally` all present in or near `runStage4_5`.

```bash
# Confirm scopedFiles is passed in (not hardcoded empty)
grep -n "runStage4_5" src/auth/operator.js
```
Expected: called as `runStage4_5(codeResult.code, scopedFiles, agreedPlan)` — 3 args.

### 2F. Stage 10 smoke test — v0.14.05 verification
```bash
grep -n "runStage10\|handleSmokeVerdict\|smokeTestAttempts\|pendingSmoke\|DID_GATE2_BLOCK\|SMOKE_TEST" \
  src/auth/operator.js src/tui/App.tsx | wc -l
```
Expected: ≥ 10 hits across both files.

```bash
# Confirm 2-retry cap is present
grep -n "MAX_SMOKE_RETRIES\|smokeTestAttempts" src/auth/operator.js
```
Expected: `MAX_SMOKE_RETRIES = 2` and counter increment/check both present.

### 2G. Run the test suite
```bash
cd /Users/johnserious/MBO && npm test 2>&1 | tail -20
```
Capture any failures as bugs. Tests passing before this session = any new failure is a regression.

---

## Phase 3 — Run a Real Task (Live Observation)

Use this section to exercise the pipeline end-to-end and observe actual behavior.
Ideal task: small, Tier 1, single-file change so you can watch every stage.

### 3A. Start MBO
```bash
mbo
```

### 3B. Fire a Tier 1 task
Type a small, well-scoped request — something that changes one file, has a clear acceptance criterion.
Good examples:
- "Add a JSDoc comment to the runStage10 method in operator.js"
- "Update the dry_run stage label string to 'Stage 4.5 — Virtual Dry Run'"

### 3C. Watch these checkpoints
As the pipeline runs, watch for and note any anomalies:

| Checkpoint | What to look for | Pass / Fail |
|------------|-----------------|-------------|
| Classification | Does it route Tier 1? Does the classifier role fire? | |
| Stage 1.5 | Does assumption ledger appear? | |
| Stage 4.5 | Does "Stage 4.5 Dry run PASS/FAIL" appear in console? | |
| Audit gate | Does `approved` or `reject` prompt appear? | |
| Stage 10 | After `approved`, does the SMOKE TEST prompt appear? | |
| Smoke test | Does `pass` complete the task? Does `fail` retry correctly? | |

### 3D. Capture observations
For each checkpoint that behaves unexpectedly, capture a bug in Phase 4 format below.

---

## Phase 4 — Bug & Feature Capture Template

Use this format for every issue or feature gap found during Phases 2-3.

### BUG Template
```
## BUG-### / v0.LL.NN
**Severity:** P0 | P1 | P2 | P3
**Found in:** Phase 2A / 2B / 2C / 2D / 2E / 2F / 2G / 3C / Other
**File/line:** src/auth/operator.js:123

**Description:**
One sentence: what is wrong.

**Reproduction:**
Exact command or pipeline trigger to reproduce.

**Expected:**
What should happen.

**Actual:**
What actually happens.

**Spec reference:**
SPEC.md Section NN / Invariant N / (none — implementation bug)

**Recommended fix:**
Short sentence. Do not spec-jump to full implementation yet.
```

### FEATURE Request Template
```
## FEAT / v0.LL.NN
**Priority:** P1 | P2
**Found in:** Phase 3C / Live observation / Other

**What's missing:**
One sentence: what the spec requires that isn't there.

**SPEC reference:**
SPEC.md Section NN

**Proposed task title for projecttracking.md:**
Short title (≤ 10 words).

**Acceptance criterion:**
One sentence: how to verify it's done.
```

---

## Phase 5 — Record to Governance

After all discoveries are captured in Phase 4 format, write them to the right files.
Do this BEFORE ending the session. Never leave captures in scratch form.

### 5A. Update BUGS.md
Append each new bug to `.dev/governance/BUGS.md` using the Bug Template format.
Assign the next sequential BUG-### number (check the tail of BUGS.md before writing).

```bash
tail -3 .dev/governance/BUGS.md  # confirm next bug number
```

### 5B. Add tasks to projecttracking.md
For each Feature Request and any P0/P1 bugs, add a row to the Active Tasks table
in `.dev/governance/projecttracking.md`. Required columns:

| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |
|---------|------|-------|--------|-------|--------|---------|-------|----------------------|------------|

- Task ID format: `v0.LL.NN` (use the lane matching the scope per `.dev/governance/VERSIONING.md`)
- Status: `READY` (not started) or `BLOCKED: reason`
- Owner: `unassigned` unless you are assigning it right now
- If session continuity matters, encode it directly in the task row (`Status`, `Links`, `Acceptance`, `Updated`) rather than creating a sidecar handoff file.

### 5C. Record session continuity in canonical ledgers
Do not create or update `NEXT_SESSION.md` or any handoff artifact.

Instead:
- update `projecttracking.md` so `Next Task`, task statuses, owners, links, and acceptance text reflect the actual stopping point;
- update `BUGS.md` and `BUGS-resolved.md` so open and resolved issues match reality;
- update root `CHANGELOG.md` only if the public version changed or a public release note is intentionally being published.

### 5D. Commit governance updates
```bash
git add .dev/governance/BUGS.md .dev/governance/BUGS-resolved.md .dev/governance/projecttracking.md CHANGELOG.md
git commit -m "chore(governance): session audit [DATE] — [one-line summary]"
```

---

## Session End Checklist

Before closing:
- [ ] All Phase 4 captures written to BUGS.md and/or projecttracking.md
- [ ] `projecttracking.md` and bug ledgers reflect today's findings and tomorrow's first task
- [ ] No uncommitted changes in `.dev/governance/`
- [ ] `git status` is clean (or intentional WIP is stashed)
- [ ] Graph index is fresh: `node scripts/graph_call.js graph_server_info`

---

## Quick Reference: Governance Invariants

| What you're doing | Rule |
|-------------------|------|
| Editing `src/auth/` | Requires `mbo auth src` + operator `go` first |
| Assigning a bug number | Must be next sequential from tail of BUGS.md |
| Adding a task | Must exist in projecttracking.md before any code is written |
| Any Tier 2+ change | DID required: derive independently before comparing (AGENTS.md §2) |
| Logging a failure | Always cite SPEC section or Invariant number if applicable |

---

*Template version: 2026-03-24 (canonical ledger continuity)*
*Maintained at: `.dev/governance/SESSION_AUDIT_PROMPT.md`*
*Companion files: `projecttracking.md`, `BUGS.md`, `AGENTS.md`*
