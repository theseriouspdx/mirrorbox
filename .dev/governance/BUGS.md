## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-164

---

### BUG-163: Operator execution loop drifts to `WORLD: mirror` + `FILES: none`, never reaches actionable audit gate | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` (routing/state transitions around refinement/derivation loop), runtime pipeline stage control
- **Severity:** P1
- **Status:** OPEN — observed in repeated TTY runs on 2026-03-19 after valid scoped requests
- **Task:** v0.11.36
- **Description:** Even with explicit scoped instructions (target bug + allowed files + required tests + audit stop), runtime repeatedly re-enters refinement and/or code derivation with `FILES: none`, drifts world routing (`subject` -> `mirror`), and fails to produce actionable diff/test/audit outputs.
- **Impact:** Blocks end-to-end workflow completion, causes non-productive long loops, and prevents audit-gate decisions on real changes.
- **Required fix:** Enforce sticky execution scope from accepted refinement intent through derivation: preserve selected world/files, reject transitions to empty file scope, and hard-fail with explicit operator message instead of looping.
- **Acceptance:** In TTY, a scoped bug-fix prompt results in (1) stable non-empty file scope, (2) concrete diff attempt, (3) requested verification commands run, and (4) audit package emitted exactly once awaiting approval.


### BUG-155: TM dashboard shows routed path costing MORE than unrouted | Milestone: 1.1 | OPEN
- **Location:** `src/state/stats-manager.js`, TM dashboard display
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.155
- **Description:** TM line shows `[32797] / $0.573070 | [50188] / $0.187499` — the routed path used more tokens AND cost more than the unrouted path. Header simultaneously claims `Routing savings $0.081491`. Either the columns are reversed, the savings calculation is wrong, or the routing decision itself is bad.
- **Acceptance:** TM display accurately reflects which path is cheaper; savings header matches the delta between columns; routing decisions provably reduce cost.

### BUG-156: Spec refinement gate fires on read-only query — blocks answer entirely | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` (gate logic), entropy/complexity scoring
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.156
- **Description:** Query "what bugs are outstanding" is a pure read/lookup against existing state. The gate fired anyway — ran entropy scoring, requested intent confirmation, ran context pinning loops — and returned nothing. A read-only retrieval query should never hit the autonomous-write governance gate. Entropy/complexity scoring is miscalibrated for retrieval queries, treating them like autonomous write operations.
- **Acceptance:** Read-only queries (lookups, status checks, summaries of known state) bypass the spec refinement gate entirely and return an answer directly.

### BUG-157: Operator did not answer the question | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js`, gate exit behavior
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19 (related to BUG-156)
- **Task:** v0.11.157
- **Description:** After the gate fired and ran entropy scoring, the operator returned only scaffolding output with no answer. Even if the gate correctly fires, it should either (a) answer from known state before presenting the gate, or (b) ask one targeted clarifying question — not block entirely and return nothing useful.
- **Acceptance:** Every operator response includes either a direct answer or a single targeted clarifying question. Returning only gate scaffolding with no answer is a failure mode.

### BUG-158: WORLD context drifts mid context_pinning loop without user input | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` (context_pinning loop), WORLD state management
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.158
- **Description:** context_pinning loop ran 5 passes for `ROUTE: analysis`. First two passes show `WORLD: subject`, last three show `WORLD: mirror` — with no user input between them. State is mutating mid-loop from an unknown source.
- **Acceptance:** WORLD value is stable across all passes of a context_pinning loop unless the user explicitly changes it.

### BUG-159: Ledger generation fails during operator run | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` (ledger generation)
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.159
- **Description:** `[Operator] Ledger generation error: [Operator] Ledger generation failed or malformed` — operator ledger failing entirely during a run. Hard failure in a core governance component. May be a symptom of BUG-156 (gate misfiring on a retrieval query producing a malformed ledger context) but surfaced as a standalone error.
- **Acceptance:** Ledger generates successfully on every operator run. If ledger fails, operator surfaces the specific cause, not a generic malformed error.

### BUG-150: Tool context token consumption is invisible to MBO cost tracking — affects all agents | Milestone: 1.1 | OPEN
- **Location:** `src/state/stats-manager.js`, `src/auth/call-model.js`, `token_log` schema
- **Severity:** P2
- **Status:** OPEN
- **Task:** unassigned
- **Description:** `token_log` and `stats-manager` track tokens consumed by `callModel` invocations only. Every token burned outside `callModel` — tool output landing in agent context — is invisible to MBO's cost model. This affects all agents differently and unpredictably:
  - **Gemini codebase explorer:** semantic expansion tool, proactively loads broad file context before any model call. Token cost per invocation is unknown and uncontrolled. Could load dozens of files and their dependency chains.
  - **Codex:** opaque context management, unknown expansion behavior per session.
  - **Claude (DC tools):** `read_multiple_files`, `read_file`, `list_directory` all land in context. Predictable per call but uncounted cumulatively.
  - **All agents — graph queries:** `graph_search` and `graph_query_impact` MCP results land in agent context. Broad queries can return thousands of tokens of node/edge data with no budget guard.
- **Root cause of discovery:** Async search tool returned partial results for BUG-146 lookup — led to analysis of why search tool behavior varies across agents and how token cost of that behavior is untracked.
- **Impact:** MBO's savings dashboard (optimized vs raw) only reflects `callModel` optimization. Actual total session cost per agent is unknown. Gemini sessions with codebase explorer active may be dramatically more expensive than token_log suggests. Cross-agent cost comparison is meaningless without this data.
- **Required fix:**
  1. Add `tool_token_log` table to `mirrorbox.db`: `(id, session_id, agent, tool_name, estimated_tokens, timestamp)`. Each agent logs tool invocations with estimated token cost of the result.
  2. Add `estimateToolTokens(result)` utility — applies same `length/4` heuristic to tool output text before it's consumed.
  3. For MBO-controlled tools (DC, MCP graph queries): instrument at the call site in `operator.js` and `callModel` context wrappers.
  4. For agent-native tools (Gemini codebase explorer, Codex file search): governance rule — agents MUST log estimated token cost of any context-loading tool call to `tool_token_log` at session start via MCP `graph_update_task` or a dedicated `log_tool_usage` MCP endpoint.
  5. `getStatus()` and the stats dashboard should surface: `callModel tokens` + `tool context tokens` = `total session tokens`, broken down by agent.
- **Known unknowns:** Gemini codebase explorer's exact expansion algorithm is not documented in MBO governance. Before fix can be fully specified, need to instrument a Gemini session and measure actual tool output token counts. Add to BUG-149 validator scope: warn when `graph_search` result exceeds 2000 tokens with no explicit budget set.
- **Acceptance:** `getStatus()` reports total session token cost including tool context. Cross-agent sessions for the same task show comparable and auditable token breakdowns. `tool_token_log` populated for at least DC and graph query tool calls.

### BUG-160: `Y: 1COMPLEXIT` — hint injection mangles COMPLEXITY field name | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` or `src/cli/` (hint injection / prompt variable assembly)
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.160
- **Description:** User entered `1` at the COMPLEXITY prompt. System echoed `Y: 1COMPLEXIT` instead of `COMPLEXITY: 1`. The trailing `Y` of `COMPLEXITY` is being consumed by the prompt variable, and the field label is being dropped. Looks like a string concatenation bug in hint injection where the prompt variable boundary is off by one.
- **Acceptance:** COMPLEXITY hint echoes as `COMPLEXITY: <value>` with no mangling.

### BUG-161: context_pinning runs 5 passes for COMPLEXITY:1 no-file analysis route | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` (context_pinning loop exit condition)
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.161
- **Description:** 5 passes of context_pinning for `ROUTE: analysis`, `COMPLEXITY: 1`, `FILES: none`. Loop is not converging or has a bad exit condition for simple low-complexity routes.
- **Acceptance:** context_pinning for COMPLEXITY:1 with no files converges in 1-2 passes maximum.

### BUG-162: FILES prompt accepts empty input without validation | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` or `src/cli/` (FILES prompt validation)
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.162
- **Description:** FILES prompt fired and accepted empty input with no validation. If certain route types require files, the gate should block empty file lists. If FILES is optional for this route, the prompt should not fire at all.
- **Acceptance:** FILES prompt either (a) does not fire when files are not required for the route, or (b) validates that required file lists are non-empty before proceeding.
