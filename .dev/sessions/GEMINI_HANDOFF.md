# GEMINI_HANDOFF.md
## Mirror Box Orchestrator — Agent Handoff Document

**For:** Gemini CLI
**From:** Claude Code (Sonnet 4.6)
**Date:** 2026-03-15
**Handoff type:** Clean state transfer — new work session

---

## 0. READ FIRST — Mandatory Session Start (AGENTS.md §1)

Before writing a single line of code, read in this order:

1. `AGENTS.md` — governance and invariants (binding)
2. `.dev/governance/projecttracking.md` — milestone and task state
3. `.dev/governance/BUGS.md` — active P0/P1 bugs
4. `.dev/sessions/NEXT_SESSION.md` — orientation

Then verify the MCP daemon:
```bash
curl http://127.0.0.1:$(node -e 'console.log(require("./.dev/run/mcp.json").port)')/health
```

Expected: `{"status":"ok","project_root":"/Users/johnserious/MBO",...}`

If not healthy: `mbo setup` or escalate to human Operator. Do not proceed without a healthy graph.

---

## 1. Current Repo State

| Item | State |
|------|-------|
| Branch | `gemini/doc-sync-final` |
| Working tree | 20+ modified/deleted files UNCOMMITTED |
| MCP daemon | HEALTHY — port 7337 |
| Test suite | 4/6 passing, 2 failing (see below) |
| Overall readiness | 🟡 YELLOW |

**Full assessment:** `.dev/reports/readiness-assessment-2026-03-15.md`

---

## 2. Step 0 Before Any Task — Commit the Working Tree

The working tree has 20+ modified/deleted files sitting uncommitted on `gemini/doc-sync-final`.
These must be committed before you create your working branch.

```bash
git status
git add -A
# Review what's staged — do not commit secrets, .env, or test DBs
git commit -m "chore: commit working tree state — pre-stabilization cleanup"
```

If there are `.tmp-*.db` files or stale `data/*.db` files in the tree, delete them first:
```bash
git status --short | grep '\.tmp-.*\.db'
# Remove any listed — they should not be committed
```

---

## 3. Your Task Queue (Ordered)

### Task 1 — H31: Fix Scan Health Regression (P0)
**Branch:** `gemini/h31-scan-health`
**Routing Tier:** Tier 1 (single concern, graph module only)
**Blocked by:** Nothing (MCP is healthy)

**Problem:**
`graph_server_info` reports `last_scan_status: failed_critical` with 3 critical failures in MBO
and 1 in johnseriouscom. This blocks `test-mcp-contract-v3.js` and poisons all graph queries.

**Root cause hypothesis (from BUGS.md BUG-073):**
Stale persisted metadata in `.mbo/mirrorbox.db` from before the BUG-072 fix. May also be a
regression introduced by the H30 project-scoped isolation changes in `static-scanner.js`.

**Investigation steps:**
```bash
# Step 1: Check live scan output
node -e "
const { GraphService } = require('./src/graph/mcp-server.js');
// or call graph_server_info via MCP
"

# Step 2: Call graph_server_info to see current state
node -e 'const r=require("./.dev/run/mcp.json"); console.log(r.port)'
# Then POST to /mcp — see AGENTS.md §11 for MCP connection details

# Step 3: If stale metadata — force rescan
# The daemon needs to re-index. Check mcp-server.js for rescan trigger.

# Step 4: Check H30 diff for any changes to static-scanner.js
git log --oneline | head -10
git show HEAD -- src/graph/static-scanner.js | head -80
```

**Files in scope:**
- `src/graph/static-scanner.js` — enrich() and scan logic
- `src/graph/mcp-server.js` — _summarizeAndPersistScan(), graph_update_task
- `.mbo/mirrorbox.db` — may hold stale server_meta rows

**Definition of Done:**
- `graph_server_info` returns `last_scan_status` that is NOT `failed_critical`
- `last_scan_critical_failures: 0`
- `node tests/test-mcp-contract-v3.js` passes
- `python3 bin/validator.py --all` still passes

---

### Task 2 — ISS-02: Fix test-state.js Concurrent Append (P0)
**Branch:** `gemini/fix-event-store-concurrent`
**Routing Tier:** Tier 1

**Problem:**
`node tests/test-state.js` crashes with TypeError on undefined during concurrent event append.
Concurrent writes to the event store are a real production scenario — pipeline stages run
concurrently and all emit events.

**Investigation:**
```bash
node tests/test-state.js 2>&1 | head -30
```
Read the full stack trace. The failure is in `src/state/event-store.js` — likely an undefined
guard missing on the append target or a missing await on an async write.

**Files in scope:**
- `src/state/event-store.js`
- `tests/test-state.js` (read only — understand the test, don't change it unless it's wrong)

**Definition of Done:**
- `node tests/test-state.js` exits 0
- `python3 bin/validator.py --all` still passes

---

### Task 3 — ISS-03: Add npm test Script (P1)
**Branch:** `gemini/ci-test-harness`
**Routing Tier:** Tier 0 (docs/config only)

**Problem:**
`package.json` has no `scripts` field. `npm test` errors. There is no single command to run
all tests. This makes CI impossible and makes verification manual.

**What to build:**
1. `tests/run-all.js` — runs all 6 test files in sequence, reports pass/fail count, exits 1 on any failure
2. Add to `package.json`:
```json
"scripts": {
  "test": "node tests/run-all.js",
  "start": "node bin/mbo.js"
}
```

**Test files to include in runner:**
- `tests/test-invariants.js`
- `tests/test-routing-matrix-mocked.js`
- `tests/test-graph-v2.js`
- `tests/test-state.js`
- `tests/test-mcp-contract-v3.js`
- (exclude `tests/legacy/` — those are archived)

**Definition of Done:**
- `npm test` runs all 5 active tests
- Output shows pass/fail per test + total count
- Exits 0 only when all pass

---

### Task 4 — H26: Persona Store & Entropy Gate (P1, Tier 2 DID)
**Branch:** `gemini/h26-persona-store`
**Routing Tier:** Tier 2 — DID required (multi-file, architectural)
**Blocked by:** Tasks 1, 2, 3 must be complete and verified first

**This is a Tier 2 task. You must:**
1. Produce your implementation proposal independently (blind — do not look at any Claude output)
2. Write a unified diff of all proposed changes
3. Human Operator reconciles your proposal with Claude's independently derived proposal
4. Only implement after human `go`

**Scope (from projecttracking.md H26 description and DESIGN_DECISIONS.md DDR-001/002):**
- `personalities/` directory with default `.md` files for all 5 roles (classifier, planner, reviewer, tiebreaker, operator)
- `.mbo/persona.json` schema (see DDR-002 for exact schema)
- `~/.orchestrator/personas/` user library support
- Persona injection into `callModel` in `src/auth/call-model.js`
- Operator extraction pass replacing `validateOutputSchema()` JSON check (DDR-001)
- Entropy Score computation in Stage 1.5
- Hard stop at Entropy > 10
- Update `agent-onboarding.md` Stage 1.5 section
- Add AGENTS.md Section 13

**Key design decisions (read before proposing):**
- `DDR-001`: `.dev/governance/DESIGN_DECISIONS.md` lines 1–56
- `DDR-002`: `.dev/governance/DESIGN_DECISIONS.md` lines 60–264

**Definition of Done (post-DID reconciliation):**
- `personalities/` directory exists with 5 role files
- `.mbo/persona.json` schema validated
- `callModel` injects persona system prompt for each role
- Extraction pass replaces JSON schema check
- Entropy > 10 produces hard stop (tested)
- `python3 bin/validator.py --all` passes
- `npm test` passes (all 5 tests)

---

## 4. The Audit Loop — How You Self-Verify

After completing each task, before presenting to the human Operator, run this sequence:

```bash
# Step 1: Validator
python3 bin/validator.py --all
# Required: PASS. If fail, fix-forward on same branch. Do not continue.

# Step 2: Full test suite
npm test
# Required: all pass. If any fail, fix on same branch.

# Step 3: Graph health
curl http://127.0.0.1:$(node -e 'console.log(require("./.dev/run/mcp.json").port)')/health
# Required: status:ok

# Step 4: No regressions
git diff main -- src/ | head -200
# Review: no unintended changes outside your task scope

# Step 5: Produce audit package
git diff main > .dev/bak/audit-$(date +%Y%m%d-%H%M).diff
echo "=== Audit Package ==="
echo "Branch: $(git branch --show-current)"
echo "Changed files:"
git diff --name-only main
echo ""
echo "Validator: PASS (confirmed above)"
echo "Tests: PASS (confirmed above)"
echo "Summary: [one paragraph — what you changed and why]"
```

Present the audit package to the human Operator. Wait for `go` or `reject`.

---

## 5. Branch Workflow (Invariant 17)

```
master
  └─ gemini/h31-scan-health          ← Task 1 branch
       └─ [implement → verify → audit package → human go → promote → delete]
  └─ gemini/fix-event-store-concurrent   ← Task 2 branch
  └─ gemini/ci-test-harness              ← Task 3 branch
  └─ gemini/h26-persona-store            ← Task 4 branch (Tier 2, after 1-3)
```

**Rules:**
- Create branch before first edit: `git checkout -b gemini/<task>`
- All edits stay on that branch
- No promotion to master until audit package presented and human says `go`
- After promotion: `git branch -d gemini/<task>` (delete local) + remote if pushed

---

## 6. What You Must NOT Do

Per AGENTS.md §4 and §9:

- Do not write to `src/` without a task in `projecttracking.md`
- Do not see Claude's output before producing your own (for Tier 2 tasks)
- Do not use `write_file` to overwrite existing files — use `replace` (Invariant 14)
- Do not skip the validator gate
- Do not promote to master without human `go`
- Do not claim authorship in commits (Section 3)
- Do not use `rm -f` (Invariant 15)
- Do not chain long bash commands that may time out

---

## 7. If Something Blocks You

**MCP unavailable:**
```bash
mbo setup
# or
curl http://127.0.0.1:7337/health
```
State: "Dev graph unavailable. Ran curl /health — [result]. Awaiting human instruction."

**Test still failing after fix attempt:**
Do not loop. State the failure clearly, show the stack trace, and ask the human Operator for direction.

**Scope unclear:**
Ask before implementing. State the ambiguity, your proposed interpretation, and wait for confirmation.

**Merge conflict on promotion:**
Resolve, do not discard changes. If unresolvable, surface to human Operator.

---

## 8. State Sync After Each Task Approval

After human `go` and promotion, update these files:

```
.dev/governance/projecttracking.md  — mark task COMPLETED with date
.dev/governance/BUGS.md             — mark bug RESOLVED if applicable
CHANGELOG.md                        — add entry for the change
.dev/sessions/NEXT_SESSION.md       — update next task pointer
```

Then commit the state sync on master:
```bash
git add .dev/governance/projecttracking.md .dev/governance/BUGS.md CHANGELOG.md .dev/sessions/NEXT_SESSION.md
git commit -m "chore: state sync after <task-id> — <one line summary>"
```

---

## 9. Key File Reference

| File | Purpose |
|------|---------|
| `src/auth/operator.js` | Pipeline stages, Operator class |
| `src/auth/call-model.js` | Model routing, injection detection, output validation |
| `src/auth/did-orchestrator.js` | DID protocol (blind derivation) |
| `src/graph/mcp-server.js` | Graph daemon, scan logic, MCP tools |
| `src/graph/static-scanner.js` | Tree-sitter scanner, enrich() |
| `src/state/event-store.js` | Event persistence (concurrent append — current fail) |
| `src/state/db-manager.js` | SQLite wrapper |
| `bin/validator.py` | Entropy tax validator (run after every change) |
| `bin/handshake.py` | Auth, Merkle root, session lock |
| `.dev/governance/DESIGN_DECISIONS.md` | DDR-001/002 — persona + NL output design |
| `.dev/reports/readiness-assessment-2026-03-15.md` | Full audit this handoff is based on |

---

*Handoff prepared by Claude Code — 2026-03-15*
*Canonical state: projecttracking.md + BUGS.md + NEXT_SESSION.md*
