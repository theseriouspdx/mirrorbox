# NEXT_SESSION.md — 2026-03-23
## MBO Architecture Correction Sprint

**Context:** External audit conducted via Cowork (Claude Sonnet 4.6) revealed that the implementation has diverged significantly from the SPEC. Full findings: `.dev/audit/cowork-audit-2026-03-23.md`

---

## Session Start Command

Paste this at the start of any new session to get fully oriented:

```
Read .dev/governance/NEXT_SESSION.md and .dev/audit/cowork-audit-2026-03-23.md.
Then run: node scripts/graph_call.js graph_server_info
Then run: node scripts/graph_call.js graph_search '{"pattern":"v1.0.01"}'
Report: graph index age, next task ID, and one-paragraph summary of what we are fixing and why.
Do not start any work until you have confirmed graph is fresh and summarized the situation.
```

---

## Session Startup — Do This First

```bash
node scripts/graph_call.js graph_server_info
```
Confirm index fresh (< 1h) and scanning = false. Then:
```bash
tail -20 .dev/governance/BUGS.md
cat .dev/governance/projecttracking.md | head -30
```

---

## The Situation in Plain English

You thought the project was working but needed polish. It's worse than that:

**The DID protocol — the core architectural feature — is not implemented per spec.**
- Gate 2 (code consensus: reviewer derives code independently, blind) doesn't exist at all.
- DID rounds 3-4 break context isolation — they're a dialogue loop, not independent derivation.
- The reviewer at the code stage is not blind.

**The model chooser doesn't work reliably.**
- `classifier` role is not set in your `.mbo/config.json` — falls to detection fallback on every request.
- Vendor diversity is inverted (planners are Gemini, reviewer is Claude — spec wants opposite).
- BUG-143 shim is patching over a schema mismatch that hasn't been fixed.

**Stage 4.5 dry run is a stub.**
- Spec requires ephemeral sandbox with running app. Code does `new Function()` syntax check.

**The audit gate fires at the wrong time.**
- Current: audit gate fires AFTER files are written to disk.
- Spec: human approval gate fires BEFORE writes.

**Stage 10 (smoke test) doesn't exist.**
- No post-execution `pass/fail/partial` human verification step. No retry cap.

---

## Proposed New Task IDs (v1.0.x series)

These are the corrections needed. Add to `projecttracking.md` in this session.

| ID | Priority | Title |
|----|----------|-------|
| **v1.0.01** | P0 | Config: missing roles (classifier, patchGenerator, onboarding) — migrate `.mbo/config.json` |
| **v1.0.02** | P0 | DID Gate 2: implement blind code consensus per SPEC Section 14 |
| **v1.0.03** | P1 | DID rounds 3-4: enforce context isolation, replace dialogue with comparison |
| **v1.0.04** | P1 | Stage 4.5: real dry run (at minimum: run project's verification commands) |
| **v1.0.05** | P1 | Stage 10: smoke test stage — `pass/fail/partial` + 2-retry cap |
| **v1.0.06** | P2 | Vendor diversity enforcement in `mbo setup` |
| **v1.0.07** | P2 | `readOnlyWorkflow` disposition — spec it or remove it |
| **v1.0.08** | P2 | Audit gate timing — move before writes (spec-compliant) or document divergence |
| **v1.0.09** | P2 | Convergence detection: replace syntactic line-matching with qualitative assessment |

---

## Recommended First Task: v1.0.01 (Config Fix)

This is the fastest win and unblocks accurate behavior for everything else. No src/auth changes needed — only config schema and `mbo setup` flow.

**Approach:**
1. Read `src/cli/setup.js` (or wherever `mbo setup` writes config)
2. Verify the 7 required roles are prompted: classifier, architecturePlanner, componentPlanner, reviewer, tiebreaker, patchGenerator, onboarding
3. Fix any missing roles in the setup wizard
4. Write a migration path for existing `.mbo/config.json` files that have only `planner` (BUG-143 shim should persist but be marked deprecated)
5. Run `mbo setup` yourself and verify all 7 roles are set in output config

**Quick config patch (manual, no setup):**
```bash
# Check current config
cat ~/.mbo/config.json || cat /Users/johnserious/MBO_Alpha/.mbo/config.json
# Then add missing roles manually using jq or editor
```

---

## After v1.0.01: v1.0.02 (DID Gate 2)

This is the most significant correctness gap. Approach:

1. Read SPEC Section 14 (`.dev/spec/SPEC.md` lines ~1074-1132)
2. Read `src/auth/did-orchestrator.js` (full)
3. The Gate 2 sequence to add:
   - After Gate 1 convergence, Planner writes code against agreed plan → `codeA`
   - Reviewer receives ONLY: original task spec + graph context + prime directive (NO plan, NO codeA)
   - Reviewer derives own plan + code → `planB`, `codeB`
   - THEN Reviewer is shown `codeA` and asked: "Does this correctly implement the agreed plan? PASS or BLOCK (cite spec violation)"
   - PASS → forward to Stage 5
   - BLOCK → return to Planner with concerns (increment block counter)
   - block counter >= 3 → Stage 4D tiebreaker
4. `verifyBlindIsolation()` must be called on Reviewer's Gate 2 prompt before dispatch

**Files to touch (require `mbo auth src` before editing):**
- `src/auth/did-orchestrator.js`
- `src/auth/operator.js` (Stage 4 code)
- Possibly new `src/auth/did-prompts.js` entries for Gate 2

---

## Key Reference Files

```
.dev/spec/SPEC.md                          Full spec — source of truth
.dev/audit/cowork-audit-2026-03-23.md      Full findings from this audit
src/auth/operator.js                       🔒 Locked — pipeline core (2441 lines)
src/auth/did-orchestrator.js               🔒 Locked — DID logic
src/auth/model-router.js                   Model routing + tier calculation
src/auth/call-model.js                     callModel() + verifyBlindIsolation()
.mbo/config.json                           Live runtime config (per-role models)
```

---

## Governance Notes

- Next bug number: BUG-201 (if any new bugs surface during corrections)
- Next task number: v1.0.01 (new v1.0.x series for correction sprint)
- All `src/auth/` edits require: `mbo auth src` + explicit operator `go`
- Assumption ledger required before planning any of the above tasks
- Do NOT start v1.0.02 (DID Gate 2) before v1.0.01 (config) is complete and verified

---

*Written: 2026-03-23 — Cowork audit session*
*Valid until: superseded by operator at session start*
