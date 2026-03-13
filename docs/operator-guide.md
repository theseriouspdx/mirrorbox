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

---

## Gate 0 Protocol (STRICT MODE)

At the start of every session, read these files in order:

1. `.dev/governance/AGENTS.md`
2. `.dev/governance/projecttracking.md`
3. `.dev/governance/BUGS.md`
4. `.dev/sessions/NEXT_SESSION.md`

**nhash affirmation** — compute the Hard State Anchor:

```
nhash = (sections_in_AGENTS.md + sections_in_BUGS.md + sections_in_NEXT_SESSION.md) × 3 × <salt>
```

User supplies the salt (a single integer). You confirm the computed value aloud before proceeding.

Run these graph queries after rescan:

```
graph_rescan()
graph_search("open tasks")
graph_search("P0 bugs")
```

---

## Auth Entry

```bash
mbo auth <scope>
```

| Command | Purpose |
|---------|---------|
| `mbo auth <scope>` | Grant write access to `src/<scope>` |
| `mbo auth status` | Check active session |
| `mbo auth <same-scope>` | Toggle revoke for active same scope |
| `python3 bin/handshake.py --pulse` | Integrity check (no side effects) |

Scope examples: `auth/operator`, `relay`, `cells/graph`, `index.js`

---

## Sovereign Factory Loop (§12)

The pipeline that processes each implementation task:

| Stage | Name | Description |
|-------|------|-------------|
| 1 | Ingest | Parse user request |
| 1.5 | Assumption Ledger | Uncertainty audit + Entropy scoring |
| 2 | Classify | Tier 1/2/3 routing |
| 3 | Gate 0 | Integrity + auth check |
| 4 | Plan | Generate implementation plan |
| 4.5 | Dry Run | Virtual execution check |
| 5 | Backup | **Atomic Topology Backup to `.dev/bak/` (Invariant 13)** |
| 6 | Write + Validate | `impl_step.sh` + `validator.py` |
| 6A | Audit Gate | Return `audit_pending`, pause for human |
| 6B | State Sync | Revoke → baseline → update graph (runs after `approved`) |

### Stage 1.5: Assumption Ledger

Before planning begins, the orchestrator audits its own uncertainty. It surfaces a JSON ledger of assumptions and blockers.

**Sign-Off Block:**
```
Entropy Score: [X]
Blockers: [N] — [list or "none"]
Critical assumptions requiring confirmation: [list IDs or "none"]
Autonomous defaults active if you type go: [list IDs]
```

**Actions:**
- **Entropy > 10:** Task decomposition recommended.
- **Blockers present:** Task is BLOCKED. Human must provide missing info.
- **Go:** Approves all autonomous defaults and proceeds to Stage 2.

### Audit Gate

When Stage 6A completes, the pipeline returns:

```json
{
  "status": "audit_pending",
  "auditPackage": { "diff": "...", "validatorOutput": "...", "summary": "..." },
  "prompt": "Audit package ready. Respond \"approved\" to sync state, or \"reject\" to roll back."
}
```

**You** (human) review the diff and respond:
- `approved` → triggers Stage 6B (state sync, baseline, graph update)
- `reject` → triggers rollback (`git checkout HEAD -- <files>`)

Do not type anything else into the REPL at this pause point.

---

## §6B State Sync Checklist

After approving an implementation:

1. `mbo auth <same-active-scope>` (toggle revoke, locks src/, writes write.deny)
2. `python3 bin/init_state.py` (recomputes Merkle root, updates state.json)
3. `graph_update_task({ task_id: "X.X-XX", status: "COMPLETE" })`
4. Update `.dev/governance/projecttracking.md` — mark task COMPLETE
5. `git add -p && git commit -m "feat(X.X-XX): ..."` (or let session-close handle)

---

## Dual Independent Derivation (DID)

Tier 2 and Tier 3 tasks require DID before implementation:

1. Claude derives the SPEC section independently (no reading Gemini's output)
2. Gemini derives the SPEC section independently (no reading Claude's output)
3. Human reviews both derivations and reconciles
4. Reconciled diff saved to `.dev/tmp/`
5. Implementation proceeds from the reconciled spec

Implementations for Tier 2/3 tasks are proposed as diffs by one agent, implemented by another.

---

## Milestone Tracking

Open tasks are tracked in `.dev/governance/projecttracking.md`.

| State | Meaning |
|-------|---------|
| `OPEN` | Not started |
| `IN PROGRESS` | Implementation diff exists |
| `IMPLEMENTED` | Files written, pending §6B sync |
| `COMPLETE` | §6B sync done, committed |

---

## Common Shell Commands

```bash
# Check handshake state
mbo auth status

# Check Merkle integrity
python3 bin/handshake.py --pulse

# Recompute and save Merkle baseline
python3 bin/init_state.py

# Start MCP server manually
node src/mcp/mcp-server.js

# View recent events
python3 bin/journal_reader.py --tail 20

# Run validator
python3 bin/validator.py --all

# Check session progress
cat .dev/run/impl_progress.json | python3 -m json.tool

# View logs
tail -f .dev/logs/mcp.out
tail -f .dev/logs/mcp.err
```
