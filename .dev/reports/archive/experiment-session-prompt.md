# Context Loading Experiment — Session Prompt
## Mirror Box Orchestrator — Pre-0.7 Architecture Validation

> **OBSERVER'S BRIEF ONLY — DO NOT SHARE WITH AGENTS BEING MEASURED.**
> This document describes what is being measured and why. Sharing it with an agent before
> measurement contaminates the data — the agent will pattern-match to described behavior.
> Use `experiment-blind-prompts.md` for the actual prompts to run in agent sessions.

**File:** `.dev/reports/experiment-session-prompt.md`  
**Purpose:** Run this as a structured session before Milestone 0.7 planning begins.  
**Background:** `.dev/reports/context-loading-experiment-0.6.md` — read this first.  
**Prerequisite:** MCP server must be running before any experiment begins.

```bash
bash scripts/mbo-start.sh --mode=dev --agent=<claude|gemini> &
kill -0 $(cat .dev/run/<claude|gemini>.pid)
```

**Note:** The E1 tool call logger is already installed in `src/graph/mcp-server.js`.  
MCP server stderr will automatically emit `[TOOL CALL] {timestamp} {tool} args: {args}` for every graph tool invocation. No setup required — just start the server and run the experiments.

---

## WHAT THIS SESSION IS

An empirical measurement session. No code is written. No tasks from projecttracking.md are executed.

During 0.6 pre-work, a comparison was run between two context-loading strategies for the same task:
- **Full-load (Prompt A):** SPEC.md + all source files attached → ~30,000 tokens
- **Graph-driven (Prompt B):** Task description only, MCP tools available → ~2,500 tokens

The critical observation: Gemini was **not instructed** to use the graph tools in Prompt B. It reached for them autonomously. The tool descriptions alone were sufficient signal.

This session answers five open questions from that experiment before they become load-bearing assumptions in the 0.7 DID pipeline design.

---

## EXPERIMENT E1 — Query Path Audit

**Goal:** Document exactly which MCP tools are called, in what order, when a model is given only a task description.

**Setup:** Enable verbose logging on the MCP server before starting.  
Check `src/graph/mcp-server.js` — `setupToolHandlers()` — add a `console.error` line at the top of the `CallToolRequestSchema` handler that logs: `[TOOL CALL] ${request.params.name} args: ${JSON.stringify(request.params.arguments)}`. This writes to stderr (not stdout), so it won't corrupt the JSON-RPC stream.

**Prompt to run (both agents, separate fresh sessions):**
```
The MBO dev graph is running. Your task:

Milestone 0.6, Task 0.6-02 — Wire the classifier in callModel to a real provider.

Begin by orienting yourself. Do not load any files manually. Use available tools to find what you need.
Report: which tools you called, in what order, and what each returned before you began planning.
```

**Measure and record:**
- Tool call sequence (from MCP server stderr log)
- Token count at the point planning began
- Which SPEC sections were loaded
- Which source files were loaded

**Output:** Write findings to `.dev/reports/E1-query-path-audit.md`

---

## EXPERIMENT E2 — Cross-Model Consistency

**Goal:** Determine if autonomous graph querying is universal or Gemini-specific.

**Method:** Run the identical Prompt B from the original experiment in both agents:

```
Task: Begin work on Milestone 0.6.0 — The Operator.

Use available tools and the 5,000-token HardState budget.
Report your token count when you are ready to begin planning.
```

Run this in:
1. A fresh Gemini CLI session (replication of original)
2. A fresh Claude Code session (cross-model test)

**Measure and record for each:**
- Did the model use MCP tools without being told to?
- Which tools were called?
- Token count reported
- Quality of the resulting plan (one paragraph assessment)

**Output:** Write findings to `.dev/reports/E2-cross-model-consistency.md`

---

## EXPERIMENT E3 — Quality Parity Check

**Goal:** Confirm the 12x token reduction does not come with a quality penalty.

**Method:** Retrieve the two plans already produced during 0.6 pre-work (Prompt A output and Prompt B output). If not preserved, re-run both prompts and capture the outputs.

Then run a blind DID comparison:
1. Give Gemini only the Prompt A plan (no label, no context about which method produced it). Ask: "Review this implementation plan for Milestone 0.6 Operator against the spec. What is missing, incorrect, or underspecified?"
2. Give Claude the same question with only the Prompt B plan.
3. Compare the two review outputs. Where both reviewers find the same gaps — confirmed gaps. Where only one reviewer flags something — investigate.

**Output:** Write findings to `.dev/reports/E3-quality-parity.md`

---

## EXPERIMENT E4 — Tier-Stratified Token Measurement

**Goal:** Verify the graph scales context to task complexity. A Tier 3 task should produce more context than a Tier 1 task.

**Method:** Run three tasks with graph-driven loading only. Measure token count before planning begins for each.

| Tier | Example task | Expected token range |
|------|-------------|----------------------|
| Tier 1 | "Fix the firewall directive truncation in call-model.js" | < 3,000 |
| Tier 2 | "Add retry logic to callModel for transient errors across all providers" | 3,000–8,000 |
| Tier 3 | "Design the context isolation enforcement mechanism for Stage 4B (DID Reviewer blind input)" | 8,000–15,000 |

Use this prompt template for each:
```
Task: [TASK DESCRIPTION]

Use available tools to orient yourself. Do not load files manually.
Report your token count before you begin proposing any implementation.
Do not implement anything — this is a measurement exercise only.
```

**Output:** Write findings and token-by-tier table to `.dev/reports/E4-tier-token-measurement.md`

---

## EXPERIMENT E5 — Stale Graph Degradation Test

**Goal:** Confirm the fallback path (AGENTS.md §1.5) activates correctly when the graph is unavailable.

**Method:**
1. Make a backup: `cp .dev/data/dev-graph.db .dev/data/dev-graph.db.bak`
2. Empty the graph: run `node -e "const {DBManager} = require('./src/state/db-manager'); const db = new DBManager('.dev/data/dev-graph.db'); db.run('DELETE FROM nodes'); db.run('DELETE FROM edges'); console.log('Graph emptied.')"`
3. Start MCP server with empty graph
4. Run Prompt B from E2

**Observe:**
- Does the model detect the empty graph?
- Does it fall back to full SPEC.md load as per §1.5?
- Does it state: "Dev graph unavailable — loading full SPEC.md" as required?
- What is the token count under fallback conditions?

5. Restore: `cp .dev/data/dev-graph.db.bak .dev/data/dev-graph.db`

**Output:** Write findings to `.dev/reports/E5-stale-graph-degradation.md`

---

## EXPERIMENT E6 — Browser Comparison (No MCP, Full Attachment)

**Goal:** Establish a clean three-way comparison: CLI+graph vs. browser+files vs. browser+graph-output-injected.  
**This is the control arm.** E1 and E2 measure the graph-driven CLI path. E6 measures the browser path with no graph access — replicating the original Prompt A condition with a controlled task.

### E6-A: Browser Full-Load (replication of original Prompt A condition)

Open a fresh Gemini or Claude browser session. Attach the following files manually:
- `.dev/spec/SPEC.md`
- `src/auth/call-model.js`
- `src/auth/operator.js`
- `src/auth/model-router.js`
- `src/state/db-manager.js`

Then run this prompt exactly:

```
Task: Milestone 0.6, Task 0.6-02 — Wire the classifier in callModel to a real provider.

Read the attached files.
Identify what needs to change and in what order.
Report: your implementation plan AND the total token count for this context window before you began planning.
```

**Measure and record:**
- Token count reported
- Which sections of SPEC.md the model referenced
- Quality of the plan (one paragraph)

### E6-B: Browser Graph-Output-Injected

Run the same task in a fresh browser session, but instead of attaching files, paste in the *output* of the graph queries from E1 (the `GraphQueryResult` JSON for the relevant nodes).

Prompt:
```
Task: Milestone 0.6, Task 0.6-02 — Wire the classifier in callModel to a real provider.

Here is the graph query result for the relevant nodes:
[PASTE E1 GRAPH OUTPUT HERE]

Based only on this context, identify what needs to change and in what order.
Report: your implementation plan AND your estimate of how many tokens this context represents.
```

**Measure and record:**
- Token count (estimated or reported)
- Whether the plan quality matches E6-A and E1/E2
- Whether the model asked for more context or was satisfied with graph output alone

### E6 Output

Write all three conditions to `.dev/reports/E6-browser-comparison.md` with a summary table:

| Condition | Token count | Plan quality | Notes |
|-----------|-------------|--------------|-------|
| CLI + graph (E1/E2) | ~2,500 | TBD | Autonomous tool use |
| Browser + full files (E6-A) | ~30,000 | TBD | Original condition |
| Browser + graph output injected (E6-B) | TBD | TBD | Graph as context block |

**The key question E6-B answers:** Is the token reduction a property of *having MCP tools*, or is it a property of *the graph output itself*? If E6-B achieves similar token counts and quality to E1/E2, then the graph output is portable — you could inject it as a context block in any environment, not just CLI with MCP.

---

After all experiments are complete, update the following before ending the session:

1. **`.dev/governance/CHANGELOG.md`** — Add an entry under a new `[Experiment Session]` heading:
   - E1 result: query path documented
   - E2 result: cross-model behavior confirmed/denied
   - E3 result: quality parity confirmed/denied
   - E4 result: tier-token table
   - E5 result: fallback path confirmed/denied

2. **`.dev/governance/AGENTS.md §11`** — If E1 and E2 confirm autonomous querying is reliable, strengthen the language from "agents must NOT load SPEC.md in full" to include: "Empirically validated [date]: autonomous graph querying observed without explicit instruction. Tool descriptions are sufficient signal."

3. **`.dev/governance/projecttracking.md`** — Mark this session complete. Add note: "Pre-0.7 architecture validation complete. Key findings: [one line per experiment]."

4. **`.dev/sessions/NEXT_SESSION.md`** — Update with experiment results summary and confirmed readiness (or blockers) for 0.7 planning.

---

## WHAT SUCCESS LOOKS LIKE

This session is complete when:
- All five experiment reports exist in `.dev/reports/`
- CHANGELOG.md records the findings
- The answer to "is graph-driven loading reliable enough to design 0.7 planner inputs around?" is YES with evidence, or NO with a clear blocker identified

This is not a feature session. No src/ files are modified. No tasks from projecttracking.md are executed. The only writes are to `.dev/reports/` and governance documents.

---

*Based on empirical finding from 2026-03-09: graph-driven context loading achieved 12x token reduction (30,000 → 2,500 tokens) with autonomous tool use. See `.dev/reports/context-loading-experiment-0.6.md` for full context.*
