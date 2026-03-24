## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-221
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / v0.LL.NN`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use the canonical lane definitions in `.dev/governance/VERSIONING.md`. The suffix after the second decimal resets within each lane (`v0.13.01`, `v0.13.02`, then separately `v0.14.01`). `v1.x` task lanes are invalid.

---

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

### BUG-218 / v0.2.13 — `mbo` bare command has no auto-update check before launching the TUI
**Severity:** P2
**Status:** OPEN
**Task:** v0.2.13
**Assigned:** unassigned
**Found:** 2026-03-24
**Description:**
When an end user runs `mbo` on a target project, the CLI launches the TUI immediately using whatever version is currently installed in `node_modules`. There is no version check against the npm registry (or a local source) and no auto-update path. If MBO ships a fix, the user continues running stale code until they manually reinstall. For a self-updating orchestrator, the bare `mbo` command should check for a newer version and update before launching.
**Acceptance:**
- `mbo` checks for a newer published version before launching the TUI.
- If a newer version is available, it updates automatically (or prompts the user).
- The check adds minimal latency (cached/async where possible).
- Offline or registry-unreachable scenarios degrade gracefully to running the installed version.

### BUG-220 / v0.3.35 — First Ctrl+C in TUI double-quit should display "press Ctrl+C again to exit"
**Severity:** P2
**Status:** OPEN
**Task:** v0.3.35
**Assigned:** unassigned
**Found:** 2026-03-24
**Description:**
The TUI uses a double Ctrl+C confirmation pattern for exit. On the first press the TUI should display
a visible message such as "Press Ctrl+C again to exit" so the user knows to press again. Currently
the first press has no visible feedback, making the double-quit pattern opaque.
**Acceptance:**
- First Ctrl+C press displays a visible "press Ctrl+C again to exit" message in the TUI.
- Second Ctrl+C within a short window exits cleanly.
- If no second press arrives within ~2 seconds, the message clears and the TUI returns to normal.
