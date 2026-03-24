## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-215
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / v0.LL.NN`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use the canonical lane definitions in `.dev/governance/VERSIONING.md`. The suffix after the second decimal resets within each lane (`v0.13.01`, `v0.13.02`, then separately `v0.14.01`). `v1.x` task lanes are invalid.

---

### BUG-212 / v0.3.29 — Terminal mouse selection still does not work in the TUI because mouse-tracking mode remains enabled
**Severity:** P1
**Status:** OPEN
**Task:** v0.3.29
**Assigned:** codex
**Found:** 2026-03-24
**Description:**
The current TUI still enables terminal mouse tracking globally, which means Terminal.app drag selection remains unreliable even though input-side mouse filtering was added. The previous fix only filtered mouse sequences after the terminal had already been placed into tracking mode. Native text selection must work from the operator's terminal without fighting the TUI.
**Acceptance:**
- Normal drag text selection works in Terminal.app while the TUI is open.
- Scroll/navigation behavior remains usable without reintroducing selection-clearing regressions.
- TUI shutdown still restores terminal state cleanly.

### BUG-213 / v0.3.30 — Task activation and assumption gate present internal ledger language instead of a clear operator-facing workflow
**Severity:** P1
**Status:** OPEN
**Task:** v0.3.30
**Assigned:** codex
**Found:** 2026-03-24
**Description:**
The activation preflight says the operator can correct assumptions, but it does not actually show those assumptions before asking for corrections. Later, the assumption gate surfaces terse internal ledger rows and `pin:/exclude:/go` instructions without enough plain-English explanation. This makes the workflow hard to understand and hard to correct.
**Acceptance:**
- Activation preflight visibly lists the assumptions and acceptance criteria it is asking the operator to review.
- The assumption gate explains each assumption in plain English and tells the operator exactly how to correct or challenge it.
- The operator has a clear path to proceed, revise, or ask for clarification without guessing the protocol.

### BUG-214 / v0.3.31 — Main TUI surface lacks a direct task-selection affordance and duplicates pipeline state in the operator panel
**Severity:** P2
**Status:** OPEN
**Task:** v0.3.31
**Assigned:** codex
**Found:** 2026-03-24
**Description:**
The main operator screen shows active tasks, but there is no first-class selection affordance comparable to `/tasks`. At the same time, the operator panel repeats stage chips that already belong to the pipeline panel, creating visual clutter and wasting vertical space that the input bar and content area need. The main screen should support direct task selection while keeping stage ownership with the pipeline panel.
**Acceptance:**
- The main operator screen provides a direct way to select an active task without opening `/tasks`.
- The operator panel no longer duplicates pipeline-stage chips that are already shown elsewhere.
- The bottom input area remains fully visible and readable at the default terminal footprint.

### BUG-208 / v0.3.27 — TUI active-task parsing drops real READY rows when projecttracking uses the legacy 9-column layout
**Severity:** P1
**Status:** OPEN
**Task:** v0.3.27
**Assigned:** codex
**Found:** 2026-03-24
**Description:**
The TUI startup surface and `/projecttracking` command can show `Next Task` while also claiming there are no active tasks. In mirrored runtime repos such as `MBO_Alpha`, `.dev/governance/projecttracking.md` still uses the older 9-column task table (`Task ID` through `Acceptance` without `Last Backup SHA/File`), but `src/tui/governance.ts` currently discards any row with fewer than 10 parsed columns. As a result, legitimate `READY` rows such as `v0.15.03` are ignored, the startup task list is empty, and the operator appears disconnected from the canonical ledger.
**Acceptance:**
- TUI startup surfaces active tasks from both 9-column and 10-column `projecttracking.md` layouts.
- `/projecttracking` and `/tasks` show `READY` rows from mirrored runtime repos correctly.
- Regression coverage proves both ledger formats are parsed without dropping active rows.

### BUG-209 / v0.3.28 — TUI natural-language task activation does not recognize explicit task IDs such as `v0.15.03`
**Severity:** P2
**Status:** OPEN
**Task:** v0.3.28
**Assigned:** codex
**Found:** 2026-03-24
**Description:**
When the operator types a direct task-selection utterance such as `lets do v0.15.03`, the TUI does not activate the matching `projecttracking.md` row. Instead the input falls through to general workflow classification, which asks for file scope and loses the task-selection intent. The TUI should recognize explicit task IDs in direct operator input and activate the corresponding task briefing without forcing the operator into the `/tasks` overlay first.
**Acceptance:**
- Inputs containing a valid active task ID (for example `v0.15.03`) activate that task directly from the operator input bar.
- If the task ID exists only in completed tasks, the TUI responds with a clear status instead of routing to generic classification.
- If the task ID does not exist, the TUI says so plainly.

### BUG-210 / v0.11.193 — Operator clarification flow does not answer self-referential follow-up questions about its own last message
**Severity:** P1
**Status:** OPEN
**Task:** v0.11.193
**Assigned:** codex
**Found:** 2026-03-24
**Description:**
If the workflow responds with a clarification such as `The standard route requires at least one file path to proceed` and the operator replies `I don't know what that means`, the system treats the follow-up as a brand-new intent instead of explaining the immediately prior message in context. This is below the expected baseline for a CLI LLM assistant and causes avoidable confusion during workflow recovery. The operator should detect self-referential clarification requests, explain the prior instruction in plain language, preserve the current task context, and offer concrete next-step examples.
**Acceptance:**
- Follow-ups such as `I don't know what that means`, `what does that mean?`, and similar clarification requests resolve against the assistant's immediately prior prompt when applicable.
- The explanation is plain-language and provides concrete examples of the expected next input.
- Existing task/workflow context is preserved rather than being discarded into a fresh classification path.

### BUG-203 / v0.12.02 — MBO graph server not registered as MCP connector in Cowork sessions
**Severity:** P2
**Status:** OPEN
**Task:** v0.12.02
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
- Session startup guidance notes `/graph` as the first command to run.

