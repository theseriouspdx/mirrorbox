# Next Session — v0.2.09 / BUG-200
**Tokenmiser counterfactual baseline understates naive-workflow cost**
_Prepared: 2026-03-23 · Picks up immediately after v0.2.08 COMPLETED_

---

## Context

The TM header and `/tm` overlay show inverted or near-zero savings — MBO appears no cheaper than
running without graph routing. The root cause: `getCostRollup()` in `src/state/db-manager.js` builds
the counterfactual from **actual tokens used** (already the low-overhead MBO-routed count) rather
than the **pre-optimisation raw token estimate** (what a naive full-file-load workflow would have spent).

The `raw_tokens_estimate` column already exists in the `token_log` schema and is populated on every
`callModel` invocation. It just isn't being included in the `getCostRollup` query.

---

## Section 27 — Assumption Ledger
**Task:** v0.2.09 · BUG-200 · Tokenmiser counterfactual fix
**Files in scope:** `src/state/db-manager.js`, `src/tui/` (label only)
**Tier proposal:** 1 (single subsystem, no architecture change, no governance touch)
**Blast radius:** Low — read-only accounting path; no API surface changes

| ID | Category | Impact | Statement | Autonomous Default |
|----|----------|--------|-----------|-------------------|
| B1 | Logic | High | `getCostRollup()` (db-manager.js:358) SQL query does not select `raw_tokens_estimate`; `byModel[]` has no `rawTokens` field; counterfactual is computed from `totalSessionTokens` (actual tokens) instead | Add `SUM(raw_tokens_estimate) AS raw_tokens_estimate` to the SQL; add `rawTokens` to the byModel map; replace `totalSessionTokens` with `totalRawTokens` in the counterfactual formula |
| B2 | Logic | Medium | If `raw_tokens_estimate` was 0 for all rows (old sessions before the column was added), `totalRawTokens` = 0 and the counterfactual would be zero — worse than before | Fall back to `totalSessionTokens` when `totalRawTokens === 0` |
| B3 | UX | Low | `/tm` overlay counterfactual row has no label indicating it represents the no-routing baseline; adding "Without graph routing" makes the saving self-explanatory | Apply label change to `src/tui/` counterfactual row |
| B4 | Scope | Low | `src/state/` lock policy — check AGENTS.md §9.3 before writing; `src/auth/` required `mbo auth src`; state may differ | Check AGENTS.md §9.3; hold at diff if locked |

**Entropy:** B1 (High): 1.5 · B2 (Medium/Low): 0.5 · B3 (Low): 0.5 · B4 (Low): 0.5 = **3.0 — gate passes**
**Critical assumptions requiring confirmation:** B1, B2
**Autonomous defaults active on `go`:** B3 (label), B4 (check lock then hold or apply)

---

## Exact Defect Site

**`src/state/db-manager.js` lines 358–402 — `getCostRollup()`**

```js
// SQL query (lines 360–370) — MISSING raw_tokens_estimate:
SELECT
  model,
  SUM(input_tokens)        AS total_input,
  SUM(output_tokens)       AS total_output,
  SUM(cost_usd)            AS actual_cost,
  SUM(raw_cost_estimate)   AS raw_cost,   // ← raw_cost already here
  COUNT(*)                 AS calls
FROM token_log GROUP BY model ORDER BY actual_cost DESC

// byModel map (lines 374–381) — rawTokens field missing:
{
  model, totalInput, totalOutput, actualCost,
  rawCost: r.raw_cost || 0,   // ← raw_cost mapped, rawTokens is not
  calls
}

// Counterfactual formula (lines 398–400) — uses actual tokens:
const totalSessionTokens = byModel.reduce((s, r) => s + r.totalInput + r.totalOutput, 0);
const counterfactualCost = (maxRatePer1k / 1000) * totalSessionTokens;  // ← WRONG
const routingSavings     = Math.max(0, counterfactualCost - actualCost);
```

**Proposed fix — three targeted changes:**

```diff
// 1. SQL — add raw_tokens_estimate column
   SUM(raw_cost_estimate)   AS raw_cost,
+  SUM(raw_tokens_estimate) AS raw_tokens_estimate,
   COUNT(*)                 AS calls

// 2. byModel map — add rawTokens field
   rawCost:    r.raw_cost    || 0,
+  rawTokens:  r.raw_tokens_estimate || 0,
   calls:      r.calls       || 0,

// 3. Counterfactual formula — use raw tokens, fall back if zero
-  const totalSessionTokens = byModel.reduce((s, r) => s + r.totalInput + r.totalOutput, 0);
-  const counterfactualCost = (maxRatePer1k / 1000) * totalSessionTokens;
+  const totalSessionTokens = byModel.reduce((s, r) => s + r.totalInput + r.totalOutput, 0);
+  const totalRawTokens     = byModel.reduce((s, r) => s + r.rawTokens, 0);
+  const baselineTokens     = totalRawTokens > 0 ? totalRawTokens : totalSessionTokens; // B2 fallback
+  const counterfactualCost = (maxRatePer1k / 1000) * baselineTokens;
```

---

## TUI label (B3 — low priority, same session)

Search `src/tui/` for the counterfactual row render. Add label `"Without graph routing"` to the
display string. Exact file/line to be confirmed by `graph_search '{"pattern":"counterfactualCost"}'`.

---

## Acceptance

- `routingSavings` is positive for any session where `raw_tokens_estimate > actual_tokens` for any call.
- Fallback: if all `raw_tokens_estimate` rows are zero, savings shows 0 (not negative).
- `/tm` overlay counterfactual row is labelled `"Without graph routing"`.
- `node -e` unit test: construct mock `byModel` rows with `rawTokens > totalInput+totalOutput`, assert
  `counterfactualCost > actualCost` and `routingSavings > 0`.

---

## State handoff

| Item | State |
|------|-------|
| v0.2.08 / BUG-199 | ✅ COMPLETED — entropy fallback cleaned (A1), [ROLE] strip fix applied (A3), 8/8 tests pass |
| v0.2.09 / BUG-200 | 🟡 READY — governance logged, diff designed, awaiting lock check + `go` |
| Next Task pointer | ✅ Updated to v0.2.09 |
| `CLAUDE.md` | ✅ Written to ~/MBO and ~/MBO_Alpha |
| `scripts/graph_call.js` | ✅ Working — use for graph queries this session |
| Graph server | ✅ Running on port 53935, 1350 nodes, last scan completed |
