## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-204
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / vX.Y.ZZ`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use `0.11.x` for milestone-1.1 hardening, cleanup, backports, and stabilization of existing runtime/onboarding/bootstrap behavior; `0.12.x` for new graph/runtime intelligence functionality such as graph-server refinement, metadata/context assembly, and knowledge-pack behavior; `0.2.x` for scripting/audit/automation; `0.3.x` for TUI/operator UX; `0.4.x` for multithreading/concurrency. When uncertain, check `.dev/governance/AGENTS.md` Section 17A.1 before assigning the bug's `vX.Y.ZZ` tag.

---

### BUG-203 / v0.12.02 — MBO graph server not registered as MCP connector in Cowork sessions
**Severity:** P2
**Status:** OPEN
**Assigned:** claude
**Found:** 2026-03-23 (observed during BUG-200 session — Claude fell back to raw DC file reads instead of graph queries)
**Description:**
When working on the MBO codebase from a Cowork session, the MBO graph server (`localhost:53935`) is not
registered as an MCP connection. This forces the agent to use Desktop Commander raw file reads (`cat`,
`sed`, `grep`) for context assembly instead of `graph_get_knowledge_pack`, `graph_search`, and
`graph_query_callers` — the exact tools MBO exists to provide. The irony is significant: MBO is being
audited and developed using workflows that bypass its own graph routing, producing higher token cost and
lower-signal context than the indexed graph would supply. The fix is to register the MBO MCP server as
a Cowork connector so Cowork sessions on this project start with the graph server available as a
first-class tool alongside Desktop Commander.
**Partial fix — 2026-03-23:** `.claude/commands/graph.md` added. Running `/graph` at session start verifies server health, reads the dynamic port from `.dev/run/mcp.json`, regenerates `.mcp.json` with the correct port, and patches `settings.local.json` — works across all auth sources (OAuth, API) since the command file is committed. `.mcp.json` stays gitignored by design (port is dynamic per AGENTS.md §11).
**Remaining:** Cowork sessions still cannot use the graph server directly (no MCP registration path in Cowork yet). Full fix requires a Cowork plugin that reads `.dev/run/mcp.json` and auto-registers the server at session start.
**Acceptance:**
- `/graph` command runs cleanly from any Claude Code session regardless of auth source and leaves the graph server available as a first-class MCP tool.
- MBO graph server is registered and available in Cowork sessions for this project (requires Cowork MCP plugin support).
- Agent can call `graph_get_knowledge_pack`, `graph_search`, `graph_query_callers` directly without falling back to raw file reads for context assembly.
- Session startup doc or NEXT_SESSION template notes `/graph` as the first command to run.

### BUG-199 / v0.2.08 — Output-Contract hardening: Log interleaving and entropy-score fudge factor
**Severity:** P1
**Status:** OPEN
**Task:** v0.2.08
**Found:** 2026-03-24 (Audit Analysis v0.2.04)
**Description:** 
1. **Log Interleaving:** Concurrent streaming from `architecturePlanner` and `componentPlanner` in Stage 3 causes "word salad" in E2E transcripts, making the DID rationale unreadable. 
2. **Entropy Discrepancy:** Subject run reported `ENTROPY SCORE: 15.0` in the raw log but the system summary reported `Entropy Score: 10`, allowing a task that should have hit a Hard Stop to proceed. 
3. **Status Bleed:** `[OPERATOR]` and `[classifier]` labels occasionally bleed into parsed assumption ID/Category fields.
**Acceptance:** 
- Planner streams are emitted sequentially in the log (buffering if necessary).
- System-calculated entropy score matches the raw log value exactly (no rounding/fudging).
- Assumption parser reliably strips status labels before splitting.

### BUG-200 / v0.2.09 — Tokenmiser counterfactual baseline understates naive-workflow cost
**Severity:** P1
**Status:** FIXED — 2026-03-23
**Task:** v0.2.09
**Found:** 2026-03-23 (operator observation)
**Description:**
TM header and `/tm` overlay display inverted or nonsensical savings — MBO appears more expensive than
a non-MBO workflow. Root cause: `getCostRollup()` in `src/state/db-manager.js` computes the
counterfactual as `totalSessionTokens × maxRatePer1k`, but `totalSessionTokens` is already the
low-overhead MBO-routed count. The naive alternative (no MBO) would load entire source files into context
at each call, producing a much higher token count. The counterfactual must be derived from the tracked
`raw_tokens_estimate` column (pre-optimisation token count recorded at each `callModel` invocation),
not from actual tokens used. Using actual tokens as the baseline makes MBO appear to offer zero or
negative savings even when it significantly reduced context size.
**Acceptance:**
- Counterfactual is computed from `SUM(raw_tokens_estimate)` per model, not from actual tokens used.
- `routingSavings` is positive whenever `raw_tokens_estimate > actual_tokens` for any call.
- `/tm` overlay labels the counterfactual row "Without graph routing" for clarity.

### BUG-201 / v0.3.24 — Runtime task creation must not pre-assign work to a specific agent
**Severity:** P2
**Status:** FIXED — 2026-03-24
**Task:** v0.3.24
**Found:** 2026-03-24 (operator observation)
**Description:**
Runtime task creation still seeded new task drafts with a concrete agent owner (`codex`). That was a temporary workflow artifact and should not persist in runtime behavior. New tasks must remain neutral until the operator explicitly assigns ownership.
**Acceptance:**
- New runtime-created task drafts default to `unassigned`, not a specific agent.
- Submitting a task without editing the owner field writes `unassigned` into `projecttracking.md`.
- No runtime task-creation path silently pre-populates agent ownership from legacy defaults.

### BUG-202 / v0.3.25 — Runtime `0.3` lane task numbering resets to `v0.3.1` instead of using the next available suffix
**Severity:** P1
**Status:** FIXED — 2026-03-24
**Task:** v0.3.25
**Found:** 2026-03-24 (operator observation)
**Description:**
When runtime logs a new `0.3` lane task, the derived task id can reset to `v0.3.1` even though `v0.3.01` is already burned and higher `0.3.x` tasks already exist. The next task id must be computed from the highest existing `0.3.x` suffix in governance, not from a broken fallback path.
**Acceptance:**
- New `0.3` lane tasks derive from the highest existing `v0.3.x` suffix plus one.
- Existing historical ids such as `v0.3.01` are treated as already consumed and are never reused.
- A runtime-created `0.3` task after `v0.3.23` receives `v0.3.24`, not `v0.3.1`.
