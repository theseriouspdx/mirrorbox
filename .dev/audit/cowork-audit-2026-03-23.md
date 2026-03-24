# Cowork Architecture Audit — 2026-03-23
## External audit conducted via Cowork session (Claude Sonnet 4.6)

**Purpose:** Independent review of MBO implementation vs. SPEC to answer: what is it doing, is the workflow correct, why doesn't model selection appear to work, and where were lazy assumptions made.

**Sources:**
- `src/auth/operator.js` (full read, 2441 lines)
- `src/auth/did-orchestrator.js` (full read)
- `src/auth/model-router.js` (full read)
- `src/auth/call-model.js` (partial read)
- `.dev/spec/SPEC.md` (full read, 3217 lines)
- `.dev/governance/projecttracking.md`
- `.dev/governance/CHANGELOG.md`

---

## Critical Finding: This is a P0 Blocker

The assumption ledger audit tool used internally (assumption ledger entropy gate) would score this task at **Critical × 3** entries × 3.0 = **9.0** approaching the 10.0 hard stop. However the findings below represent *confirmed* spec violations, not uncertainty — entropy is low because the facts are clear.

---

## Section 1: What the Pipeline Actually Does

### Entry Point
`Operator.processMessage(userMessage)` — every user input routes here.

### Execution Paths

| Path | Entry Condition | Stages Actually Run |
|------|----------------|---------------------|
| Idle Conversation | `route: analysis` + `risk: low` + no files | Operator LLM call only |
| Tier 0 (Safelist) | Files safelisted + complexity 1 + zero blast radius | 1→1.5→6→7→8 |
| Tier 1 (Sequential) | Default single-file | 1→1.5→3→4→4.5→6→7→8 |
| Tier 2/3 (DID) | `tier >= 2` | 1→1.5→3(DID)→4→4D?→6→7→8 |
| Entropy Blocked | entropyScore > 10 | 1→1.5 STOP |
| readOnlyWorkflow | Keyword match | 1→1.5→report only |

### Stage Map (Implementation)

**Stage 1 — Classification** (`classifyRequest`)
- Model: `classifier` role
- Output sections: ROUTE, WORLD, RISK, COMPLEXITY, FILES, RATIONALE, CONFIDENCE
- Fallback: `_heuristicClassifier()` if model fails or confidence < 0.6
- `readOnlyWorkflow` flag set here if message matches hardcoded keywords

**Stage 1.5 — Assumption Ledger + Entropy Gate** (`runStage1_5`)
- Model: `classifier` role (second call)
- Output sections: ASSUMPTIONS (pipe-delimited), BLOCKERS, ENTROPY SCORE
- Entropy always recalculated via `_calculateEntropy()` regardless of model output
- If entropyScore > 10.0 → hard stop, user must decompose
- If blockers > 0 → [BLOCKED] prefix appended
- Human must type `go` to proceed → sets `stateSummary.pendingDecision`

**Stage 3 (Tier 2/3 DID Path)** (`runStage3`)
- `shouldRunDID(routing)` = `routing.tier >= 2`
- Invokes `this.didOrchestrator.run()` → returns `didPackage`
- If `verdict === 'needs_human'` → escalates immediately
- If no `finalDiff` → sets `needsTiebreaker: true`

**Stage 3 (Tier 1 Sequential Path)** (`runStage3`)
- Calls `architecturePlanner` and `componentPlanner` **in parallel** with identical prompts
- Calls `evaluateSpecAdherence()` (classifier role) to check consensus
- If divergent → Stage 3D (plan tiebreaker)

**Stage 4 — Code Derivation** (`runStage4`)
- Calls `patchGenerator` and `reviewer` in parallel (not blind-isolated)
- Checks convergence via line-set intersection (`_agreedLines`)
- If divergent → Stage 4D (code tiebreaker, up to 3 retries)
- readOnlyWorkflow fallback: uses `FALLBACK_WORKFLOW_CODE` constant, skips file writes

**Stage 4.5 — Dry Run**
- Does: `new Function()` syntax check
- Returns: `{status: 'pass', checks: ['structural_syntax']}`

**Stage 6 — Write** (`runStage6`)
- Extracts fenced code blocks tagged with filename
- Calls `handshake.py` permission check per file
- Writes via `fs.writeFileSync()`
- Calls `validator.py --all`

**Stage 7 — Audit Gate** (implementation-invented, not in spec)
- Runs `git diff HEAD`
- Sets `stateSummary.pendingAudit`
- Waits for `approved` / `reject`
- `reject` → `git checkout HEAD -- <files>` rollback

**Stage 8 — State Sync** (`runStage8`)
- Revokes permissions via `handshake.py --revoke`
- Calls `graph_ingest_runtime_trace` if trace file exists
- Calls `graph_update_task`
- Sets stage to `knowledge_update`

---

## Section 2: Spec vs. Implementation Gap Table

### Stages in SPEC (19 total)

| Spec Stage | Description | Implementation Status |
|-----------|-------------|----------------------|
| 1 | Request Classification | ✅ Present, roughly correct |
| 1.5 | Human Intervention Gate (context pinning) | ✅ Present |
| 2 | Architecture Query (graph-first, before planning) | ⚠️ Folded into Stage 1.5 knowledge pack call, not a dedicated stage |
| 3A | Independent Plan Derivation — Arch Planner (blind) | ✅ Present (Tier 1: parallel call; Tier 2+: DID round 1) |
| 3B | Independent Plan Derivation — Comp Planner (blind, zero visibility into 3A) | ✅ Present round 1; ❌ Context isolation broken in DID rounds 3-4 |
| 3C | Gate 1: Plan Consensus — qualitative architectural intent match | ⚠️ Present but uses syntactic line-intersection, not qualitative comparison |
| 3D | Plan Tiebreaker (plan only, no code) | ✅ Present and correct |
| 4A | Independent Code Derivation — Arch Planner | ❌ Not present as specified; patchGenerator is not the same role |
| 4B | Independent Code Derivation — Adversarial Reviewer (blind, own plan, own code) | ❌ **MISSING ENTIRELY** — reviewer is not blind at code stage |
| 4C | Gate 2: Code Consensus — reviewer audits planner code, block/pass, up to 3 blocks | ❌ **MISSING ENTIRELY** — no block counter, no independent reviewer code |
| 4D | Code Tiebreaker | ⚠️ Present but fires after 3 retries of non-independent review, not spec's Gate 2 |
| 4.5 | Virtual Dry Run — ephemeral sandbox, running app, URL/port, replan/override/abort | ❌ **STUB** — `new Function()` syntax check only |
| 5 | Human Approval Gate | ✅ Present (simplified) |
| 6 | Patch Generation (deterministic, git 3-way merge) | ⚠️ Present but not using 3-way merge |
| 7 | Structural Verification (compilation, lint, static analysis) | ⚠️ Single `validator.py` call — not separated from Stage 8 |
| 8 | Runtime Verification (test suite, build pipeline) | ⚠️ Merged with Stage 7 in `validator.py` |
| 10 | Smoke Test — human `pass/fail/partial`, 2-retry cap, abort on 3rd fail | ❌ **NOT IMPLEMENTED** |
| 11 | Knowledge Update | ✅ Partially present |
| 11.5 | Visual Audit (disabled by default) | ➖ Intentionally deferred per spec |

### Critical Gaps Summary

**P0 — Gate 2 (Code Consensus) is missing:**
The spec's entire code review mechanism doesn't exist. The reviewer is not blind, produces no independent code, and there's no block counter. What exists is: parallel patchGenerator + reviewer calls with the same prompt, then line-intersection comparison. This is not Gate 2.

**P0 — DID context isolation broken after round 2:**
Spec: "No agent sees another agent's work before producing its own."
Implementation: Planner R2 receives `combinedDiff` from Reviewer R1. Reviewer R2 receives `plannerR2Raw`. Rounds 3-4 are a dialogue, not independent derivation.

**P1 — Stage 4.5 is a stub:**
Spec requires ephemeral sandbox container with running app, live URL, interactive review, and structured `replan/override/abort` decision. Implementation does a syntax check.

**P1 — Stage 10 (Smoke Test) not implemented:**
Post-execution human verification step with `pass/fail/partial` verdicts and 2-retry cap doesn't exist.

---

## Section 3: Model Selection — Findings

### What the Spec Defines (Section 11)

Config path: `~/.orchestrator/config.json` (note: implementation uses `~/.mbo/config.json`)

Required roles with spec-recommended defaults:
| Role | Spec Default | Current `.mbo/config.json` |
|------|-------------|---------------------------|
| classifier | Local (Ollama/LM Studio) — "speed, cost, no network dependency" | **MISSING** — falls to detection fallback |
| architecturePlanner | Claude (CLI or API) | `gemini-2.5-flash` via `planner` alias (BUG-143) |
| componentPlanner | Claude (CLI or API) | `gemini-2.5-flash` via `planner` alias (BUG-143) |
| reviewer | Gemini — "different vendor, correlated error prevention" | `claude-sonnet-4-6` |
| tiebreaker | Best available frontier | `claude-opus-4-6` |
| patchGenerator | Local or DeepSeek | **MISSING** — falls to detection fallback |
| onboarding | Best available frontier | **MISSING** — falls to detection fallback |

### Critical Issues

1. **`classifier` not in config** — runs on every single request; falls to detection fallback which silently picks whatever is available. This means you have no reliable control over what classifies your tasks.

2. **Vendor diversity inverted** — Spec says reviewer must be a different vendor from planners. "This is not a preference — it is a structural property of the system." Current config: both planners are Gemini, reviewer is Claude. Not necessarily wrong in outcome, but breaks the vendor diversity guarantee.

3. **BUG-143 shim** — `model-router.js` has an alias that maps `planner` → `architecturePlanner` + `componentPlanner`. This is a known workaround for a config schema mismatch. The spec wants both roles configured independently so they can be routed to different models.

4. **Config schema drift** — Spec defines nested `models.{role}` schema. Implementation uses flat keys. These are reconciled by the BUG-143 shim but the underlying schema mismatch is never fixed.

### Fix: Run `mbo setup` and explicitly set:
- classifier → local model or a fast/cheap cloud model
- architecturePlanner → Claude
- componentPlanner → Claude (or separate model)
- reviewer → Gemini (different vendor from planners)
- tiebreaker → Claude Opus or best available
- patchGenerator → local or DeepSeek
- onboarding → Claude Opus

---

## Section 4: DID Protocol — Detailed Findings

### Spec's DID vs. Implementation

**Spec (Section 14):**
```
Gate 1:
  3A: Arch Planner → Plan A          [blind]
  3B: Comp Planner → Plan B          [blind, zero visibility into 3A]
  3C: Compare plans → qualitative architectural intent match?
    AGREE → Gate 2
    DISAGREE → 3D Tiebreaker (plan only, no code written)

Gate 2:
  4A: Arch Planner → Code A          [against Gate 1 agreed plan]
  4B: Reviewer → own Plan B + Code B [blind — own derivation, no planner output]
  [Reviewer submits → THEN shown planner's work]
  4C: Reviewer audits Code A vs agreed plan
    PASS → Stage 5
    BLOCK (≤3x) → back to 4A with concerns
    BLOCK (>3x) → 4D Code Tiebreaker
```

**Implementation:**
```
(Tier 2/3 DID path):
  Round 1: architecturePlanner → diff A   [blind ✓, protectedHashes enforced]
  Round 2: componentPlanner → diff B      [blind ✓, verifyBlindIsolation enforced]
  Round 3: architecturePlanner R2 → reviews COMBINED diff [NOT blind — sees diff B]
  Round 4: componentPlanner R2 → final attempt [NOT blind — sees Planner R2 output]
  Round 5: tiebreaker → arbitrates [once, correct]

(Tier 1 sequential path):
  architecturePlanner + componentPlanner called IN PARALLEL with IDENTICAL prompts
  → evaluateSpecAdherence (classifier) compares output syntactically
  → if divergent → Stage 3D
```

### Specific Violations

1. **Gate 2 entirely absent** — No independent code derivation by reviewer at code stage. This is the most significant DID violation.

2. **DID rounds 3-4 are dialogue, not derivation** — After rounds 1-2, the system switches from blind comparison to a collaborative review loop. This contradicts the spec's core principle.

3. **Tier 1 parallel calls** — Running both planners with identical prompts simultaneously doesn't produce independent derivation. The prompts are identical so the outputs will be similar for similar reasons. The spec's independence comes from sequential submission, not parallel isolation.

4. **Convergence detection is syntactic** — `_agreedLines()` uses line-set intersection. Spec defines convergence as "both plans fulfill the same qualitative intent and preserve project invariants. Literal file list parity NOT required."

5. **Persona mismatch (BUG-143 related)** — Router uses `architecturePlanner`/`componentPlanner` but personalities are registered as `planner`/`reviewer`. Both agents may get the same persona, defeating per-agent behavioral differentiation.

---

## Section 5: Invented Implementation Concepts Not in Spec

These exist in the implementation but have no spec definition:

1. **`readOnlyWorkflow`** — Triggered by keyword match ("readiness-check workflow"), bypasses all planning and code stages. Returns a hardcoded string. No spec definition. Appears to be a test harness path that leaked into production code.

2. **`audit_gate` stage** — Implementation's post-write human approval point. The spec doesn't define this as a stage. The spec's Stage 5 (human approval gate) fires *before* writes, not after. The implementation's audit_gate is *after* writes, which means mistakes have already been applied to the filesystem when the human reviews them.

3. **`FALLBACK_WORKFLOW_CODE` constant** — Hardcoded string returned when `readOnlyWorkflow` is active or plan intent mentions "readiness-check workflow." Completely bypasses code derivation. Not in spec.

4. **Heuristic classifier fallback** — When the classifier model fails, a set of keyword-matching rules produces a classification. Not spec-defined. Silently degrades quality with no user notification.

---

## Section 6: Proposed Task List (for projecttracking.md)

### P0 — Immediate blockers

**v1.0.01** — Config: Add missing roles (classifier, patchGenerator, onboarding) to `mbo setup` and ensure existing `.mbo/config.json` is migrated. Acceptance: All 7 roles are explicitly set in config after setup; no role falls to detection fallback.

**v1.0.02** — DID Gate 2: Implement code consensus stage per spec. Reviewer must: receive only original task spec + graph context (blind), derive own plan + code independently, submit own work, then (and only then) receive planner's code for comparison audit. Block counter must cap at 3 before invoking code tiebreaker. Acceptance: Reviewer prompt assembly verified to contain no planner code/plan prior to submission; block counter increments correctly; 3 blocks → 4D tiebreaker.

### P1 — High priority

**v1.0.03** — DID rounds 3-4 context isolation: Rounds 3 and 4 must not pass prior round output into prompts. Replace dialogue loop with spec-compliant comparison: both plans submitted independently, then compared by a neutral comparator role. Acceptance: `verifyBlindIsolation` enforced on all DID rounds, not just rounds 1-2.

**v1.0.04** — Stage 4.5 real dry run: Replace `new Function()` stub with a real validation pass. Minimum viable: run the project's own verification commands from onboarding profile. Ideal: subprocess sandbox with timeout, stdout/stderr capture, exit code check. Acceptance: `validator.py` or verification commands actually execute; failures surface to user with `replan/override/abort` decision.

**v1.0.05** — Stage 10 smoke test: After state sync, present human with `pass/fail/partial` prompt. Track retry count. Abort task on 3rd fail. Log `fail {reason}` to event store and BUGS.md. Acceptance: Workflow reaches `pass` acknowledgement before marking task complete; retry counter enforced.

### P2 — Medium priority

**v1.0.06** — Vendor diversity enforcement: `mbo setup` must warn if planners and reviewer are same vendor. Config validation should flag same-vendor assignments as a non-fatal warning with remediation prompt. Acceptance: Setup warns on same-vendor planner+reviewer selection.

**v1.0.07** — `readOnlyWorkflow` disposition: Decide and document whether this is an intentional first-class feature or a test harness that should be removed. If kept, give it a spec section. If removed, clean up all code paths that reference it. Acceptance: `readOnlyWorkflow` either has a SPEC section defining its behavior or is removed from the codebase.

**v1.0.08** — Audit gate timing: The current `audit_gate` fires AFTER files are written to disk. The spec's Stage 5 approval gate fires BEFORE writes. Decide whether to move the gate (spec-compliant, safer) or document the current post-write design as an intentional divergence. Acceptance: Either audit_gate fires before Stage 6 writes, or SPEC section explicitly documents and justifies post-write review.

**v1.0.09** — Convergence detection: Replace syntactic line-intersection in `_agreedLines()` with a qualitative assessment call. Model should assess whether two plans share architectural intent and preserve invariants, not whether they share literal diff lines. Acceptance: Convergence check prompt includes qualitative criteria per SPEC Section 14 divergence signal table.

---

*Audit conducted: 2026-03-23*
*Auditor: Cowork session, Claude Sonnet 4.6*
*Files examined: 6 source files, 3217-line SPEC*
*Note: Investigation 5 (TUI state fidelity) not completed — lower priority given pipeline-level findings above.*
