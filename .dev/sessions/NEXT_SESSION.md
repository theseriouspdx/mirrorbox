# NEXT_SESSION — Cross-Agent Cost Comparison (v0.12.01)

## Session ended: 2026-03-19
## Owner: claude

---

## Prime Directive (carry forward)
We are running the latest MBO from `/Users/johnserious/MBO` and validating an installer-first
flow in `/Users/johnserious/MBO_Alpha`. The next session tackles v0.12.01 — cross-agent cost
comparison — after completing any outstanding v0.11.36 acceptance work.

---

## What happened this session

### BUG-147 RESOLVED — Onboarding JSON protocol rewrite
- Eliminated JSON-as-communication-protocol from `src/cli/onboarding.js`
- Replaced per-turn `type:"question"` / `type:"persist"` JSON with plain-English
  conversation + single `---WORKING AGREEMENT---` sentinel at Phase 5 only
- Scan data now passed as human-readable briefing text (not `JSON.stringify(scan)`)
- Re-onboard update mode added per Section 5/UX-024 — shows existing agreement,
  asks only unknown/changed fields
- Working Agreement displayed before persist per Section 36.3 (Accept/Edit/Regenerate)
- `MAX_INTERVIEW_TURNS = 20` guard — sentinel absent → clean 36.8 error, no stack trace
- `renderPlanAsText()` added and exported for operator use

### BUG-148 RESOLVED — Operator JSON.stringify(plan) prompts
- Replaced all four `JSON.stringify(plan/planA/planB/concerns)` instances in
  LLM-facing prompts in `src/auth/operator.js` with `renderPlanAsText()`
- `JSON.stringify(plan)` at line 1770 (`computeContentHashes`) is NOT a violation —
  that's Invariant 7 blind-isolation hashing, not LLM prompt injection

### BUG-144 RESOLVED — downstream of BUG-147
- Budget overflow was caused by growing JSON transcript; eliminated by sentinel arch

### BUG-149 OPEN — validator guard needed
- `bin/validator.py --all` should fail on JSON-as-protocol patterns in callModel prompts
- Test suite needs a live TTY path that exercises `runOnboarding` with real `callModel`
- unassigned

### BUG-150 OPEN — tool context tokens invisible to cost tracking
- `token_log` only sees `callModel` calls — tool output tokens uncounted
- Prerequisite for v0.12.01 cross-agent cost comparison
- unassigned

### Root cause analysis: how BUG-147 got in
- Introduced in v0.11.22 (Adaptive Onboarding v2) — agent chose JSON routing as path
  of least resistance, did not read `.dev/preflight/onboarding-conversational-model.md`
  or reconcile against Section 36
- Test suite `nonInteractive` bypass skips `callModel` entirely — live path never failed
- No agent flagged it because code and persona were aligned with each other (both wrong)

### Bug number conflict resolution
- BUG-146 was already taken (hardcoded MCP port literals, resolved by codex 2026-03-19)
- Our bugs correctly renumbered to BUG-147 / BUG-148
- Lesson: always `read_file` BUGS.md + BUGS-resolved.md directly before claiming a number
  — never rely on async search (partial results from incomplete traversal)

---

## Next session objective: v0.12.01

**Task:** Cross-agent cost comparison — per-task model-tier cost rollup and value proof

**The question to answer:** For the same task, does MBO cost less than asking a single
agent directly? Answer in dollars, not just tokens — because routing cheap work to Flash
while using Sonnet only for load-bearing calls may be cheaper even with more total tokens.

**What already exists:**
- `token_log` table: `model`, `input_tokens`, `output_tokens`, `cost_usd`, `run_id` per call
- `pricing.js`: per-model rates (Flash, Pro, Sonnet, etc.), live-fetched + cached
- `model-router.js`: knows which role maps to which model tier
- `stats-manager.js`: session/lifetime totals, already surfaces optimized vs raw delta

**What's missing:**
1. Per-task cost rollup by model — `SELECT model, SUM(cost_usd), SUM(input_tokens+output_tokens) FROM token_log WHERE run_id=? GROUP BY model`
2. Counterfactual — `SUM(all_tokens) × most_expensive_model_rate_in_mix` = "what it would have cost with one model"
3. Routing savings = counterfactual − actual
4. Surface in `getStatus()` and stats dashboard

**Gate 0 queries to run:**
```
graph_search("token_log stats-manager cost")
graph_search("getStatus dashboard tokenmiser")
```

**Read first:**
- `/Users/johnserious/MBO/.dev/governance/AGENTS.md`
- `/Users/johnserious/MBO/.dev/governance/projecttracking.md`
- `/Users/johnserious/MBO/.dev/governance/BUGS.md`
- `/Users/johnserious/MBO/.dev/sessions/NEXT_SESSION.md`

---

## Still outstanding from v0.11.36

Before or alongside v0.12.01, the installer-first Alpha E2E acceptance run still needs
to happen with a TTY transcript to formally close v0.11.36:
- rsync MBO → MBO_Alpha (excluding .git/node_modules)
- install via `scripts/mbo-install-alpha.sh`
- run via `cd MBO_Alpha && npx mbo`
- verify: no BUDGET_EXCEEDED, no JSON parse warnings, Working Agreement displayed,
  profile written correctly
- save transcript to both `.mbo/logs/` and `.dev/sessions/analysis`

BUG-145 (self-run warning / controllerRoot drift) still open P2 — address after v0.11.36
acceptance or fold into v0.12.01 session.

---

## Session end state
- Cold storage: check `.dev/recovery/` for latest snapshot
- BUGS.md next number: BUG-151
- projecttracking.md: v0.11.36 IN_PROGRESS, v0.12.01 BACKLOG
- ROADMAP.md: v0.12.01 added to Milestone 1.2
