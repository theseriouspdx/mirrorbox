# MBO Operator Guide

## Session Workflow

Every working session follows this pattern:

```
1. Load letsgo.md (session start)
2. Gate 0: read governance files + nhash affirmation
3. Run graph_rescan + graph_search to orient
4. Agent generates Assumption Ledger (Stage 1.5)
5. Review assumptions + blockers. Respond 'go' to approve defaults.
6. Grant auth scope: mbo <scope>
7. Agent creates atomic backup in .dev/bak/ (Invariant 13)
8. Agent implements via impl_step.sh (one file at a time)
9. Audit gate: review diff + validator output
10. Approve or reject
11. On approve: §6B state sync (revoke → baseline → mark task COMPLETE)
12. Commit + update projecttracking.md
```

## Gate 0 Protocol (STRICT MODE)

At the start of every session, read these files in order:

1. `.dev/governance/AGENTS.md`
2. `.dev/governance/projecttracking.md`
3. `.dev/governance/BUGS.md`

**nhash affirmation** — compute the Hard State Anchor:

```
nhash = (sections_in_AGENTS.md + sections_in_BUGS.md) × 3 × <salt>
```

User supplies the salt (a single integer). You confirm the computed value aloud before proceeding.

Run these graph queries after rescan:

```
graph_rescan()
graph_search("open tasks")
graph_search("P0 bugs")
```

---

## §6B State Sync Checklist

After approving an implementation:

1. `mbo auth <same-active-scope>` (toggle revoke, locks src/, writes write.deny)
2. `python3 bin/init_state.py` (recomputes Merkle root, updates state.json)
3. `graph_update_task({ task_id: "X.X-XX", status: "COMPLETE" })`
4. Update `.dev/governance/projecttracking.md` — mark task COMPLETE
5. Update `.dev/governance/BUGS.md` for active items only and move resolved/completed entries to `.dev/governance/BUGS-resolved.md`
6. `git add -p && git commit -m "feat(X.X-XX): ..."` (or let session-close handle)


## Runtime Entry

Use `mbo` or `npx mbo` from the target project directory. Do not run direct node launchers (`node .../bin/mbo.js`) during acceptance runs.
