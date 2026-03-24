# Tokenmiser Semantics — Interview Record & Mismatch Analysis
## Task: v0.2.05 | BUG-187 | 2026-03-23

---

## 1. Intended Behavior (from user interview)

### 1.1 Core Purpose
Tokenmiser serves three overlapping value proofs simultaneously:
1. **Cost tracker** — what did this session actually cost across all models
2. **Routing savings proof** — what would it have cost if every call used the most expensive model, vs. what it actually cost because MBO routed smarter
3. **Token volume display** — raw token counts per model/stage, especially useful for local models where cost=$0 but effort is real

### 1.2 Savings Definition (Option B — confirmed)
The canonical savings number is **routing savings only**:
```
routingSavings = counterfactualCost - actualCost
```
Where `counterfactualCost` = total session tokens × per-token rate of the most expensive model present.
This is already computed correctly in `db.getCostRollup()`.

### 1.3 Local Model Handling
- Local models: tokens shown, cost = $0.00
- High token count + $0 cost = correct and desirable outcome
- Counterfactual still computed against most expensive API model — savings number remains meaningful

### 1.4 Display Surface Map

| Surface | What it shows |
|---|---|
| **Operator panel / stage window** | Per-stage token count, updating as pipeline advances |
| **Pipeline panel** | Session summary: routing savings + actual total cost |
| **`/tm` slash command** | Per-model drill-down: model name, tokens in, tokens out, cost, calls |
| **SHIFT+T overlay** | Section 1: Routing savings proof. Section 2: Per-model token+cost breakdown |
| **Header bar** | No changes |

---

## 2. Current Behavior (actual implementation)

### 2.1 Savings calculation — WRONG
- Current: `savings = rawCostEst - costEst`
- `rawCostEst` is populated from `rawCost` passed into `statsManager.recordCall()`
- `rawCost` in `call-model.js` = estimated cost if the same tokens were sent to the same model without compression
- This measures **token compression savings**, not **routing savings**
- The two are conflated — a call to a cheap model with no compression still shows "savings"

### 2.2 `notOptimized` field — WRONG semantic label
- Current label in overlay: "tokens (if single-model)"
- Actual meaning: estimated tokens if context was not compressed (length/4 heuristic)
- These are not the same thing. The label is misleading.

### 2.3 Operator panel token display — MISSING
- OperatorPanel shows a single aggregate `operator: Xtok · $Y` in the header
- No per-stage breakdown visible as pipeline advances
- `stageTokenTotals` exists in state but only surfaces in StatsPanel sidebar and PipelinePanel stage chips

### 2.4 Pipeline panel session summary — MISSING
- PipelinePanel shows per-stage token chips (correct) but no session-level routing savings summary
- Routing savings (`getCostRollup()`) result is never surfaced in the Pipeline panel

### 2.5 `/tm` command — NOT WIRED
- `SPEC §30.3` references `/token` command; operator responds to `/token` but routes to the SHIFT+T overlay path
- No dedicated per-model drill-down table separate from the overlay

### 2.6 SHIFT+T overlay — PARTIALLY CORRECT
- Has "BY MODEL — Session" section (correct structure)
- Savings row labeled "savings vs single-model" but calculated from `rawCostEst - costEst` (token compression, not routing)
- `getCostRollup()` with correct routing savings is available in `db-manager.js` but not used in the overlay

---

## 3. Required Changes (implementation scope)

### 3.1 `src/state/stats-manager.js`
- No structural changes needed
- `recordCall()` `rawCost` parameter semantics: keep as-is for token compression tracking (secondary metric)
- Add `getRoutingSavings()` method that delegates to `db.getCostRollup()` for the canonical savings number

### 3.2 `src/tui/components/OperatorPanel.tsx`
- Add per-stage token display below the action label
- Show `stageTokenTotals` from stats: each completed/active stage → `STAGE_LABEL: Xtok · model`
- Only show stages that have token data (don't show empty stages)

### 3.3 `src/tui/components/PipelinePanel.tsx`
- Add session summary footer: `SAVED $X.XX (routed) · Actual $X.XX · X total tok`
- Source: `db.getCostRollup()` for savings; `stats.session` totals for token count
- Position: below stage chips, above the pipeline output scroll area

### 3.4 `src/tui/components/StatsOverlay.tsx`
- Section 1: Replace current savings row with routing savings from `getCostRollup()`
  - Show: actual cost, counterfactual cost, most expensive model, routing savings amount + %
  - Fix label: "routing savings (smart model selection)" not "savings vs single-model"
- Section 2: Per-model breakdown — keep existing structure, it's correct
- Remove or relabel `notOptimized` row — rename to "token compression est." with dimmer styling to make clear it's secondary

### 3.5 `src/auth/operator.js`
- `/tm` is an alias for `/token` — one-line addition to command dispatch, both route to same handler
- `/token` handler updated to call `renderTmCommand()` instead of routing to SHIFT+T overlay

### 3.6 `src/cli/tokenmiser-dashboard.js`
- Add `renderTmCommand()`: per-model table for operator CLI context
- No changes to `renderHeader()` (header untouched per user instruction)

---

## 4. What Does NOT Change
- Header bar — no modifications
- Token counting logic in `call-model.js` — unchanged
- `statsManager.recordCall()` signature — unchanged
- `db.getCostRollup()` — already correct, just needs to be surfaced in more places
- Per-role token display in OperatorPanel header — keep as-is

---

## 5. Acceptance Criteria (transcript-level)

1. Operator panel shows per-stage token counts updating as pipeline advances — not just aggregate
2. Pipeline panel shows routing savings summary at session level
3. `/tm` command returns a per-model breakdown table, not the SHIFT+T overlay
4. SHIFT+T overlay Section 1 shows routing savings sourced from `getCostRollup()`, correctly labeled
5. Local models show tokens + $0.00 cost throughout — no odd savings artifacts
6. Routing savings = counterfactual minus actual, where counterfactual uses highest-rate model's per-token price
