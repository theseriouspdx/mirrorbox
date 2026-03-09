# E1 — Query Path Audit
**Date:** 2026-03-09
**Agent:** Claude Code (claude-sonnet-4-6)
**Task given:** Milestone 0.6, Task 0.6-02 — Wire the classifier in callModel to a real provider.
**Instruction:** Begin by orienting yourself. Do not load any files manually. Use available tools.

---

## Tool Call Sequence

| Step | Tool | Query / Node ID | Purpose |
|------|------|-----------------|---------|
| 1 | `graph_search` | `callModel` | Locate the primary function by name |
| 2 | `graph_query_impact` | `file://src/auth/call-model.js#callModel@191:15` | What is affected by touching callModel? |
| 3 | `graph_search` | `classifier` | Find the classifier hook in the codebase |
| 4 | `graph_search` | `operator` | Find Operator class + associated SPEC section |
| 5 | `graph_query_impact` | `file://src/auth/operator.js#classifyRequest@150:8` | Downstream callers of classifyRequest |
| 6 | `graph_query_dependencies` | `file://src/auth/call-model.js#callModel@191:15` | What does callModel depend on? |
| 7 | `graph_search` | `Section 8` | Locate SPEC section for Operator / Tier routing |
| 8 | `graph_search` | `model-router` | Find routing config and routeModels function |
| 9 | Read | `src/auth/operator.js:150–225` | classifyRequest + _heuristicClassifier bodies |
| 10 | Read | `src/auth/call-model.js:191–237` | callModel body — confirm placeholder branch |
| 11 | Read | `src/auth/model-router.js` | Full routing matrix — all 7 roles |

**Total tool calls before planning:** 11 (8 graph queries, 3 targeted reads)

---

## Token Count at Planning-Ready Point

- Graph query results: ~800 tokens
- 3 targeted source sections: ~1,300 tokens
- **Total: ~2,100 tokens**

Full SPEC.md (~85KB / ~21,000 tokens) was not loaded.
SPEC Section 8 was *identified* by graph_search but not yet read — would be loaded as the next step in a real task session (~500–800 tokens estimated).

---

## Which SPEC Sections Were Loaded

- **Section 8 — The Operator**: identified by graph_search, startLine 565. Not read during E1 (identified but not consumed).
- No other SPEC sections loaded.

---

## Which Source Files Were Loaded

- `src/auth/operator.js` — lines 150–225 (classifyRequest + _heuristicClassifier)
- `src/auth/call-model.js` — lines 191–237 (callModel body)
- `src/auth/model-router.js` — full file (84 lines)

Files **not** loaded (not needed to orient):
- `src/state/db-manager.js`
- `src/auth/session-detector.js`
- `src/auth/openrouter-detector.js`
- All other src/ files

---

## Key Finding

The placeholder path is explicit and self-documenting at `operator.js:176`:
```js
if (response === "Response placeholder") {
  return this._heuristicClassifier(userMessage);
}
```

The routing matrix in `model-router.js` is fully wired for the `classifier` role (lines 24–31):
```js
// 1. Classifier - OpenRouter > Local > CLI
if (or.detected) {
  routingMap.classifier = { provider: 'openrouter', model: 'google/gemini-2.0-flash-001' };
} else if (local.ollama.detected) { ... }
else if (cli.gemini.authenticated) { ... }
```

Task 0.6-02 is a routing validation and live-fire test, not a new wiring task. The infrastructure is complete. The work is: run the routing matrix against real providers, confirm the placeholder branch is never hit, and validate all Tier 0–3 paths.

---

## Graph Query Quality Assessment

**Useful queries (returned actionable nodes):**
- `graph_search('callModel')` → immediate hit, exact line
- `graph_search('operator')` → full Operator class function inventory + SPEC node
- `graph_search('model-router')` → routeModels function + file node

**Low-signal queries:**
- `graph_query_impact('callModel@191:15')` → returned only the containing file (DEFINES relation). No caller graph populated — suggests callModel has no indexed callers in src/ yet, which is expected at this stage.
- `graph_query_dependencies('callModel@191:15')` → empty. Dependency edges not yet indexed at function granularity.

**Conclusion:** graph_search is the high-value entry point. graph_query_impact is useful once callers exist. graph_query_dependencies needs function-level edge population in a future milestone.

---

## Observation: Autonomous Tool Selection

The agent (Claude Code) was not instructed which tools to use. The tool descriptions alone were sufficient to produce the query sequence above. Orientation was complete before any files were manually loaded. This replicates the Gemini CLI behaviour observed in the original experiment.

---

*Written by Claude Code, experiment session 2026-03-09*
