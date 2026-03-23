# Agent Onboarding — MBO Quick Reference

This file is the first thing a new agent session should read after loading governance files.

---

## Session Start (STRICT MODE)

Before doing anything else, run Gate 0:

1. Read `.dev/governance/AGENTS.md` (all sections)
2. Read `.dev/governance/projecttracking.md` (find OPEN tasks)
3. Read `.dev/governance/BUGS.md` (find P0/P1 items)
4. Call `graph_rescan()` then `graph_search("open tasks")`
5. Report nhash to human and wait for salt confirmation

Do not implement anything until Gate 0 + nhash is complete.

---

## Critical Rules

### You CANNOT:
- Write to `src/` without a valid handshake session (write.deny will block you)
- **Overwrite or modify existing files via `write_file` (Invariant 14).** You MUST use `replace` for all modifications to ensure surgical precision. `write_file` is reserved for new files.
- Call `handshake.py <scope>` or `handshake.py --revoke` — human only
- Proceed to Planning (Stage 3) without human `go` on the Assumption Ledger (Stage 1.5), including Tier 0 and read-only workflows
- Auto-approve the audit gate — you must pause and wait for human

### You CAN:
- Call `handshake.py --status` and `--pulse` at any time
- Read all files freely
- Propose diffs and save them to `.dev/tmp/`
- Run `validator.py`, `journal_reader.py`, MCP tools

---

## Key Files

| File | Purpose |
|------|---------|
| `.dev/governance/AGENTS.md` | Agent rules, pipeline spec |
| `.dev/governance/projecttracking.md` | Milestone task status |
| `.dev/governance/BUGS.md` | Active bugs |
| `.dev/governance/BUGS-resolved.md` | Resolved/completed bug archive |

---

## Session End

Before ending a session:
1. Run `mbo --revoke` (locks src/)
2. Run `python3 bin/init_state.py` (recompute baseline)
3. Update `projecttracking.md` task statuses
4. Keep `.dev/governance/BUGS.md` active-only and archive resolved/completed entries in `.dev/governance/BUGS-resolved.md`
5. Commit with meaningful message


## Runtime Entry

Use `mbo` or `npx mbo` from the target project directory. Do not run direct node launchers (`node .../bin/mbo.js`) during acceptance runs.
