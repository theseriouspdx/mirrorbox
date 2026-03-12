# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** 2026-03-12
**Last task:** Task 1.1-11 — Implement MBO Handshake & 'No Assumptions' mandate
**Status:** COMPLETED

---

## Section 1 — Next Action

**Task 1.1-10 — Graph Server Trust Contract (server identity + client assertion)**

This task takes priority over 1.1-06 (BUG-050). Rationale: the trust contract is
infrastructure that every subsequent session depends on. Running on a stale or
wrong-root graph silently corrupts every query result. BUG-050 is a pipeline logic
bug that can wait one task.

**Graph queries to run at Gate 0:**
```
graph_search("graph_rescan")
graph_search("callTool")
graph_search("GraphService")
graph_search("sendMCPRequest")
graph_search("startMCP")
```

---

## Section 2 — Session Summary

**Task 1.1-11 — Implement MBO Handshake & 'No Assumptions' mandate — CLOSED**

Hardened the session start protocol to prevent autonomous action:
1. Updated `AGENTS.md` Section 8 to mandate a specific handshake response including the "No Assumptions" mandate and a task confirmation gate.
2. Added "No Autonomous Problem Solving" as Rule 7 in Strict Mode (§9), defining technical blockers as findings to be reported, not bugs for agents to fix autonomously.
3. Updated `projecttracking.md` with Task 1.1-11.

---

**Task 1.1-10 — Architecture Review — OPEN**

No code was written for this task yet. The session included a design review prompted by
recurring graph server failures.

**Root cause identified (architectural, not a single bug):**

The recurring failure pattern across BUG-046, BUG-049, BUG-053, and the current
graph_rescan failure is not individual bugs — it is a missing trust contract between
the graph server and its clients. Every client (Operator, Claude CLI, Gemini CLI)
connects to the server and immediately trusts whatever it gets back, with no
verification that the server is scanning the right codebase or that the graph is
current. This produces silent wrong-context failures that are harder to debug than
hard crashes.

**Design decision:**

The graph server needs a lightweight identity endpoint/tool. Every client asserts
project identity and index freshness before trusting any query result. Explicit
graph_rescan after client-side file mutations replaces any watcher dependency.

**DID output reviewed:**

One agent ran the graph server architecture DID prompt. Key aligned findings:
- "Reachable URL means correct server" is the most dangerous current assumption
- "Process running means graph is current" is the second most dangerous
- Root identity verification (project_id hash) is mandatory, not optional
- File watcher is the wrong solution for Phase 1 — explicit rescan is more reliable
  across Linux, CI, and Docker contexts

**No file edits made this session.**

---

## Section 3 — Task 1.1-10 Full Scope

### What to build

**Part A — Server: `graph_server_info` MCP tool**

Add a new tool to `src/graph/mcp-server.js` → `GraphService.listTools()` and
`GraphService.callTool()`.

Tool name: `graph_server_info`

Returns (JSON):
```json
{
  "project_root": "/absolute/canonical/realpath",
  "project_id": "<sha256 of canonical root string, first 16 hex chars>",
  "server_version": "<from package.json>",
  "index_revision": "<monotonic integer, incremented on every completed rescan>",
  "last_indexed_at": "<ISO 8601 UTC timestamp of last completed scan>",
  "node_count": 308,
  "is_scanning": false
}
```

Implementation notes:
- `project_root` = `fs.realpathSync(this.root)` — canonical, no symlinks
- `project_id` = `crypto.createHash('sha256').update(project_root).digest('hex').slice(0,16)`
- `index_revision` = integer stored on `GraphService`, starts at 0, incremented
  in `enqueueWrite` after every successful `scanDirectory` or `scanFile` completes
- `last_indexed_at` = timestamp stored on `GraphService`, updated same time as revision
- `node_count` = live query: `SELECT COUNT(*) FROM nodes`
- `is_scanning` = `this.isScanning`

`index_revision` and `last_indexed_at` must persist across server restarts. Store
them in the graph DB as a `server_meta` key-value table (two rows: `index_revision`
and `last_indexed_at`). On startup, read them from DB. On each completed scan, write
them back inside the same transaction that finalizes the scan.

**Part B — Server: root resolution fix**

`parseArgs()` currently falls back to `process.cwd()` for root. This is the source
of the current wrong-root bug (server cwd is `/Users/johnserious/MBO`, not
`/Users/johnserious/mbo`).

Change: if `--root` arg is not present, derive root from `__dirname`:
```js
root = path.resolve(__dirname, '../../');
```

`__dirname` for `src/graph/mcp-server.js` is always `<project>/src/graph` regardless
of how the process was launched. Two levels up is always the project root.
No flag needed, no cwd dependency.

Keep `--root` arg support for explicit override (testing, edge cases), but make
`__dirname`-derived root the default.

**Part C — Operator: assert trust on connect**

In `src/auth/operator.js`, after MCP session is initialized (after
`_initializeMCPWithRetry` completes), call `graph_server_info` and validate:

1. `project_id` matches expected — expected is derived from the project root the
   Operator resolved at startup (the `.mbo/` upward walk result). If mismatch:
   hard fail with message:
   `Graph server is serving a different project. Expected: <root>. Got: <root>. Run: launchctl kickstart -k gui/$UID/com.johnserious.mbo-mcp`

2. `is_scanning` flag — if true, wait up to 30s polling `graph_server_info` until
   false before proceeding. Log progress.

3. `index_revision` — store it on the Operator instance as `this.graphRevisionAtConnect`.
   After any `graph_update_task` or `graph_rescan` call, fetch `graph_server_info`
   again and verify revision incremented. If not, log a warning: `Graph rescan
   completed but index_revision did not increment — possible scan failure.`

No client-side staleness policy needed in Phase 1 beyond the revision check above.

**Part D — Claude and Gemini adapter path**

Claude CLI and Gemini CLI connect via `.mcp.json` and `.gemini/settings.json` — they
do not go through Operator code. They cannot assert project_id automatically.

For Phase 1: document the manual verification command in `AGENTS.md`:
```
Before starting work: call graph_server_info and verify project_root matches
the project you intend to work on.
```

In Phase 2 (future task): MBO can generate a session-start macro that auto-calls
`graph_server_info` and prints a clear mismatch warning if root is wrong.

**Part E — Explicit rescan contract**

Document in `AGENTS.md` (and update `graph_rescan` tool description in
`GraphService.listTools()`):

> After any file modifications, call `graph_rescan` to update the index.
> The graph does not watch for changes. Call `graph_server_info` after rescan
> to confirm `index_revision` incremented.

No watcher. No automatic detection. Explicit contract.

---

## Section 4 — Validation Criteria for Close

1. `graph_server_info` tool returns all six fields with correct types
2. `project_root` is canonical realpath (symlinks resolved)
3. `project_id` is deterministic — same root always produces same ID
4. `index_revision` increments after `graph_rescan` completes
5. `last_indexed_at` updates after `graph_rescan` completes
6. `index_revision` and `last_indexed_at` survive server restart (persisted to DB)
7. Operator logs project_id assertion result on every connect
8. Operator hard-fails with actionable message on project_id mismatch
9. Operator waits correctly when `is_scanning` is true at connect time
10. Server root is derived from `__dirname` by default — `graph_server_info` returns
    correct root regardless of what `cwd` was at launch time

---

## Section 5 — State Snapshot

- BUG-053: CLOSED
- BUG-050: OPEN — deferred to 1.1-11
- 1.1-06 through 1.1-09: OPEN (unchanged)
- 1.1-10: OPEN — next action (new task, this session)
- 1.1-H05: IN REVIEW
- MCP server: operational on port 4737 (dev), 3737 (runtime)
- Graph: 308 nodes, stale (last indexed Mar 11) — first thing to fix in next session
  via graph_rescan after 1.1-10 Part B lands

## Session End Checklist
- Status: closed_clean
- Timestamp: 2026-03-12
