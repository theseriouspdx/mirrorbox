# Assumption Ledger — Task 1.1-H29 (Context Minimization & Tiered Routing)
## Status: OPEN
## Date: 2026-03-16

This ledger tracks the assumptions made during the implementation of Section 35.

| Assumption ID | Description | Impact | Risk | Points |
|---------------|-------------|--------|------|--------|
| A29-01 | `src/auth/model-router.js` exists and contains the Tier 0-3 definitions as referenced in SPEC Section 8. | High | Medium | 1.5 |
| A29-02 | The "Refinement Gate" can be implemented as a pure function within `call-model.js` or a new `context-manager.js` utility. | High | Low | 0.5 |
| A29-03 | Graph impact queries (`graph_query_impact`) are accessible and performant enough to be used in the routing pre-call. | Critical | Medium | 3.0 |
| A29-04 | "Prompt Caching" refers to a local digest-based cache of system/invariant blocks to save tokens/latency, not a model-level feature (like Anthropic caching). | High | Medium | 1.5 |
| A29-05 | `src/utils/tokenizer.js` is missing and needs to be implemented or replaced by a lightweight character-based heuristic ($chars/4) as per existing `call-model.js` logic. | High | Low | 0.5 |
| A29-06 | Token budgets are configurable at the project level (`.mbo/config.json`) and user level (`~/.orchestrator/config.json`). | High | Low | 0.5 |
| A29-07 | "Full-dump injection" specifically refers to the `wrapContext` behavior of including entire file contents without filtering. | High | Low | 0.5 |

## Entropy Score: 8.0
(Threshold: 10.0 — **PROCEED**)

## Reasoning
The task is complex but well-defined in Section 35. The primary risk (A29-03) is the dependency on the graph server's performance for impact queries during every model call. If the graph is large, this could introduce significant latency. However, the entropy is below the hard stop threshold.
