# Agent Onboarding — MBO Quick Reference

This file is the first thing a new agent session should read after loading governance files.

---

## What You Are

You are working inside **Mirror Box Orchestrator (MBO)** — a self-developing orchestrator in Phase 3 Supervised Self-Development. The codebase is self-referential: the tools you build here are later used to build more of themselves.

Two worlds exist:
- **Mirror** (`world_id: mirror`) — this repo, the development environment
- **Subject** (`world_id: subject`) — the deployed copy at `../MBO_Alpha`

Every operation must be tagged with a `world_id`. Never mix concerns from mirror and subject.

---

## Session Start (STRICT MODE)

Before doing anything else, run Gate 0:

1. Read `.dev/governance/AGENTS.md` (all sections)
2. Read `.dev/governance/projecttracking.md` (find OPEN tasks)
3. Read `.dev/governance/BUGS.md` (find P0/P1 items)
4. Read `.dev/sessions/NEXT_SESSION.md` (orientation)
5. Call `graph_rescan()` then `graph_search("open tasks")`
6. Report nhash to human and wait for salt confirmation

Do not implement anything until Gate 0 + nhash is complete.

---

## Critical Rules

### You CANNOT:
- Write to `src/` without a valid handshake session (write.deny will block you)
- Call `handshake.py <scope>` or `handshake.py --revoke` — human only
- Proceed to Planning (Stage 3) without human `go` on the Assumption Ledger (Stage 1.5)
- Auto-approve the audit gate — you must pause and wait for human
- Write more than one file per `impl_step.sh` invocation
- Continue implementing after `write.deny` is set
- Jump ahead to another task before completing §6B state sync

### You CAN:
- Call `handshake.py --status` and `--pulse` at any time
- Read all files freely
- Propose diffs and save them to `.dev/tmp/`
- Run `validator.py`, `journal_reader.py`, MCP tools

---

## Stage 1.5 — Assumption Ledger

For all Tier 1+ tasks, you must generate a **Section 27 Assumption Ledger** before planning.

1.  Analyze the task for implicit assumptions.
2.  Assign impact (`Critical`, `High`, `Low`) and define `autonomousDefaults`.
3.  Identify any **BLOCKED** items.
4.  Compute the **Entropy Score**.
5.  **STOP** and present the ledger to the human.
6.  Wait for human `go` before proceeding to Stage 2/3.

---

## Writing Files

All writes go through `impl_step.sh`:

```bash
bash bin/impl_step.sh <task_id> <file_path> <content_file>
```

If you get `BLOCKED: write.deny sentinel active`, stop immediately and report to human. Do not retry, do not loop.

---

## Approval Gate

When Stage 6A returns `audit_pending`:

1. Display the diff and validator output to the human
2. **STOP** — do not proceed, do not time out, do not auto-rollback
3. Wait for human to type `approved` or `reject`
4. On `approved`: call `runStage8()` (state sync)
5. On `reject`: call `runStage7Rollback()`

---

## Task Tier Rules

| Tier | Threshold | DID Required? | Stage 1.5 Required? |
|------|-----------|---------------|---------------------|
| 1 | < 50 lines, single file | No | Yes |
| 2 | Multi-file or architectural | Yes, spec only | Yes |
| 3 | Load-bearing / security | Yes, full impl | Yes |

---

## Key Files

| File | Purpose |
|------|---------|
| `.dev/governance/AGENTS.md` | Agent rules, pipeline spec |
| `.dev/governance/projecttracking.md` | Milestone task status |
| `.dev/governance/BUGS.md` | Active bugs |
| `.journal/state.json` | Canonical Merkle root + metadata |
| `.journal/session.lock` | Active handshake token |
| `.journal/audit.log` | Handshake grant/revoke history |
| `.dev/run/write.deny` | Sentinel: src writes blocked when present |
| `.dev/run/impl_progress.json` | Per-session write progress |
| `.dev/run/relay.sock` | UDS for Subject→Mirror telemetry (The Relay) |
| `src/relay/guard.js` | Guard: validates relay packets (§25) |
| `src/relay/pile.js` | Pile: Mirror→Subject promotion (§26) |

---

## MCP Tools

Run `graph_rescan()` first, then:

- `graph_search("keyword")` — find nodes by text
- `graph_query_impact("node_id")` — what does this affect?
- `graph_query_dependencies("node_id")` — what does this depend on?
- `graph_query_callers("node_id")` — who calls this?
- `graph_update_task({ task_id, status })` — update task state

### MCP Query Helper Safety Notes

- Always invoke with Node explicitly:

```bash
node ./mcp_query.js tools_list
node ./mcp_query.js graph_search "open tasks"
```

- If helper returns `project_root mismatch`, stop and recover MCP manifest from the canonical project path before continuing.
- If handshake returns `EXTERNAL_MUTATION_DETECTED`, run hydration recovery before requesting write auth:

```bash
python3 bin/handshake.py --reset
python3 bin/handshake.py --pulse
mbo auth src
```

---

## Session End

Before ending a session:
1. Run `mbo --revoke` (locks src/)
2. Run `python3 bin/init_state.py` (recompute baseline)
3. Update `projecttracking.md` task statuses
4. Commit with meaningful message
5. Write `.dev/sessions/NEXT_SESSION.md` with: next action, pending items, task IDs
