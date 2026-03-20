## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-170

---

### BUG-169: DID tiebreaker null-verdict — unparseable tiebreaker response silently declares convergence with null finalDiff | Milestone: 1.1 | OPEN
- **Location:** `src/auth/did-orchestrator.js` — Stage 5 tiebreaker exit path and `_package()`
- **Severity:** P1
- **Status:** OPEN — observed live 2026-03-19
- **Task:** v0.11.169
- **Description:** When the tiebreaker model response lacks a parseable `VERDICT:` section and `FINAL DIFF:` section (e.g. plain-English or malformed output), `tbVerdict` collapses to `''` and `finalDiff` is `null`. The code fell through to `_package(..., 'convergent')` with a null diff, falsely signalling plan convergence. The operator's `!didPackage.did.finalDiff` guard then returned `needsTiebreaker: true` — a meaningless state since the tiebreaker had already run — rather than surfacing a human escalation.
- **Impact:** Live Tier 2/3 tasks silently returned a structureless "convergent" plan with no diff; operator entered an unrecoverable `needsTiebreaker` holding state with no user-facing escalation path.
- **Root cause:** No explicit null-verdict guard in Stage 5 exit path; `_package()` had no defensive check preventing `convergent` + null `finalDiff` from being emitted.
- **Fix:** (1) Explicit guard in Stage 5: if `!tbVerdict && !finalDiff`, return `needs_human` immediately. (2) Defensive guard in `_package()`: any `convergent` verdict with null `finalDiff` is promoted to `needs_human`. Both guards emit `DID_RECONCILIATION_PACKAGE` with the corrected verdict.
- **Acceptance:** Live Tier 2/3 task with unparseable tiebreaker response surfaces `escalatedToHuman: true` to the operator, not `needsTiebreaker: true`. No `convergent` package is ever emitted without a non-null `finalDiff`.

---

### BUG-166: Global install runtime resolves relay socket under package root causing EACCES and crash loop | Milestone: 1.1 | OPEN
- **Location:** `src/relay/relay-listener.js`, runtime bootstrap in `src/index.js`
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.166
- **Description:** In globally-installed execution (`npm install -g`), `relay-listener` binds `relay.sock` under `.../lib/node_modules/mbo/.dev/run/relay.sock` via `__dirname`-relative path resolution. That package path is not writable for runtime socket creation in normal user execution, producing `listen EACCES` and repeated operator crash/respawn loops.
- **Impact:** Onboarding can complete but runtime cannot remain up. `mbo` repeatedly respawns and cannot enter stable interactive operation from a package install.
- **Acceptance:** Relay socket and incident flag resolve against runtime project root (`MBO_PROJECT_ROOT`/`cwd`) instead of package source root; global install launches without `EACCES` and without crash loop.

### BUG-167: Non-TTY onboarding failure enters uncontrolled respawn loop instead of fail-closed exit | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js` (respawn supervisor behavior), `src/index.js` non-TTY onboarding guard
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.167
- **Description:** When onboarding is required and `mbo` runs in non-TTY mode, `src/index.js` correctly emits `ERROR: Non-TTY launch requires onboarding...` and exits, but the CLI wrapper immediately respawns the operator repeatedly. This creates noisy infinite failure loops instead of a single terminal failure.
- **Impact:** Automation and scripted checks cannot detect clean failure semantics; logs flood and process churn increases.
- **Acceptance:** For deterministic startup failures (including non-TTY onboarding required), wrapper exits once with non-zero status and no respawn loop.

---


### BUG-168: Missing runtime config bootstrap (`.mbo/config.json`) causes startup ambiguity in fresh installs | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js`, `src/cli/setup.js`, `src/index.js`
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.168
- **Description:** Fresh package-installed runs can enter mixed startup states when local runtime config (`.mbo/config.json`) is absent or incomplete while global config exists. Error messaging and guard flow are inconsistent across setup/runtime paths, making failures look like a missing "config js/json" bootstrap issue.
- **Impact:** Operators see confusing startup behavior during first-run automation and non-interactive checks; root-cause diagnosis is slowed.
- **Acceptance:** Startup path deterministically creates or validates required local runtime config before operator launch, and failure messaging points to exact missing config file and remediation.

---

### BUG-165: MCP symlink not updated on new server startup; AGENTS.md Section 11 documents wrong recovery command | Milestone: 1.1 | OPEN
- **Location:** `src/graph/mcp-server.js` (startup symlink logic, line ~826–830), `.dev/governance/AGENTS.md` (Section 11)
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.165
- **Description:** Two related issues:
  1. When a new `mbo mcp` instance starts after a prior instance crashed, the startup symlink creation silently fails. The stale dangling `mcp.json → mcp-<id>-<dead-pid>.json` symlink is never removed before the new one is written. The failure is swallowed by `try/catch` (line 830), leaving `mcp.json` broken even though the new server is live and healthy. Confirmed: two live servers running (PIDs 49161, 69899) but `mcp.json` still points to dead PID 52653.
  2. AGENTS.md Section 11 documents `mbo setup` as the command to start the dev graph server. This is incorrect — `mbo setup` enters the onboarding/workflow prompt. The correct restart command is `mbo mcp`.
- **Root cause:** (1) No dangling-symlink detection before new symlink creation; error swallowed silently. (2) AGENTS.md Section 11 was authored with the wrong command.
- **Acceptance:** (1) On `mbo mcp` startup, if `mcp.json` is a broken symlink (target file absent), it is removed before the new pidManifest symlink is written. `mcp.json` always points to a live manifest after startup. (2) AGENTS.md Section 11 start command reads `mbo mcp`, not `mbo setup`.

### BUG-157: Operator did not answer the question | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js`, gate exit behavior
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19 (related to BUG-156)
- **Task:** v0.11.157
- **Description:** After the gate fired and ran entropy scoring, the operator returned only scaffolding output with no answer. Even if the gate correctly fires, it should either (a) answer from known state before presenting the gate, or (b) ask one targeted clarifying question — not block entirely and return nothing useful.
- **Acceptance:** Every operator response includes either a direct answer or a single targeted clarifying question. Returning only gate scaffolding with no answer is a failure mode.

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
### BUG-164: `mbo setup` from controller root falls through to runtime prompt instead of hard-stop | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js`, `src/cli/startup-checks.js`, setup/runtime handoff
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.164
- **Description:** Running setup from `/Users/johnserious/MBO` (controller repo) while targeting `/Users/johnserious/MBO_Alpha` triggers root-mismatch re-onboarding output, then drops directly into `MBO 0.11.24 >` interactive prompt without an explicit blocking error. This bypasses the expected hard-stop behavior for controller-root execution and creates ambiguous root ownership during onboarding/runtime entry.
- **Impact:** Operators can enter live runtime from the wrong root context, causing unstable onboarding state, cross-root confusion, and potential unsafe mutations against the wrong project.
- **Acceptance:** Controller-root invocation is fail-closed with explicit error + required action (`cd /Users/johnserious/MBO_Alpha` or run from target root). Runtime prompt must never open when self-run/root-mismatch guard fails.
