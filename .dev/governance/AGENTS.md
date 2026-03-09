# AGENTS.md
## Mirror Box Orchestrator — Phase 1: Human-Builder Governance

**Scope:** This file governs the development of the MBO foundation during Phase 1. It applies to all agents (e.g., Gemini CLI, Claude Code) acting as a peer development team for human architects. Read at the start of every session before any code is written.

---

## Section 1 — Session Start Protocol

Every development session begins in this order. No exceptions.

1. Read this file (`.dev/governance/AGENTS.md`)
2. Read `.dev/governance/projecttracking.md` — identify current milestone and active task
3. Read `.dev/governance/BUGS.md` — check for anything P0 blocking current milestone
4. Load SPEC.md context per **Section 11** — graph-first if MCP reachable, full load if not

No code is written before this sequence completes.

### Section 1.5 — MCP Server

The MCP server starts automatically. Do not start it manually. Do not verify the PID file.

The first graph query in Section 11 confirms MCP is reachable. If it fails, fall back to full SPEC.md load.

---

## Section 2 — Development Protocol (DID) & Routing Tiers

**Every task must exist in `projecttracking.md` before code is written.**

The agents are interchangeable peers. Before executing a task, the human Operator determines the Routing Tier:

**Tier 0 & 1 (Low Risk / Single File / Docs):**
- A single agent proposes the implementation and writes the diff. 
- If the human approves, that agent implements it directly.

**Tier 2 & 3 (High Risk / Multi-File / Architecture / Governance):** (Dual Independent Derivation)
1. Any modification to `SPEC.md`, `AGENTS.md`, or the governance directory.
2. Agent A (Gemini or Claude) proposes the implementation and writes the diff. 
3. Agent B (the other agent) MUST independently derive their own implementation BLIND (without seeing Agent A's code).
4. The human Operator reconciles the two versions.
5. Only after reconciliation and human "go" is the implementation committed.

---

## Section 3 — Authorship & Attribution Policy

1. **Authorship is for the Architect:** No agent shall claim authorship credit on commit pushes, pull requests, or documentation.
2. **Metadata Only:** Agents may be identified in Git metadata as the `Committer` or within a `Co-authored-by:` trailer, but the `Author` field is reserved exclusively for the human architect.
3. **No "AI-Generated" Branding:** Agents must not prepend "AI-Generated" or similar self-crediting labels to commit messages unless explicitly configured by the architect for audit purposes.

---

## Section 4 — What Agents Can and Cannot Do

| Agent | Can | Cannot |
|-------|-----|--------|
| Gemini CLI | Peer developer. Propose, review, derive, and implement. | Write to src/ without task in projecttracking.md |
| Claude Code | Peer developer. Propose, review, derive, and implement. | See the other agent's reasoning before producing its own |
| Either | Read SPEC.md, BUGS.md, projecttracking.md, AGENTS.md | Modify governance docs without human approval |

### Spec Is Source of Truth
If implementation conflicts with spec, the spec wins. If the spec is wrong, stop. File the bug in BUGS.md. If P0: fix the spec before writing the fix. Do not implement workarounds to spec bugs.

---

## Section 5 — Session Management & Two-World Integrity

This section defines the mandatory protocols for maintaining isolation between the Mirror (Local) and Subject (Target) environments, as well as the requirements for state persistence and recovery.

### Invariant 10 (Two-World Isolation)
- Every operation shall explicitly declare its target scope: world_id = mirror | subject.
- Reads may span worlds; writes must target exactly one world.
- Missing or invalid world_id is a hard failure.

### Invariant 11 (Graph Investigation)
- Run only the graph queries specified in NEXT_SESSION.md Section 1.
- Load only what those queries return. Do not expand further.
- Full SPEC/file-dump context injection is disallowed by default.

### Invariant 12 (HardState Budget)
- Enforce 5,000-token HardState ceiling.
- Allocation:
  - 600 invariants/objective
  - 1,800 evidence
  - 1,200 prior decisions
  - 900 reasoning
  - 500 reserve/safety
- Governance invariants are non-evictable.

### Invariant 13 (Pre-Mutation Checkpoints)
- Immutable checkpoint required before any mutation in either world.
- Checkpoint must include hash + parent reference.

### Invariant 15 (Non-Destructive Recovery)
- Prohibit rm -f and delete/recreate schema recovery patterns.
- Recovery only via forward migration, compatibility adapter, replay, or checkpoint rollback.

### Invariant 16 (Atomic Session-End Backup)
- On session close, atomically persist:
  - event flush
  - graph delta/index update
  - handoff record
  - checkpoint IDs
  - integrity hashes
- Run PRAGMA integrity_check as part of backup validation.
- Mark session closed_clean or closed_with_incident.

---

## Section 6 — Proactive State Sync & Session Protocols

The human acts as the approval gate and reconciliation point, not the workflow engine.

### 6A. The Completion Prompt
The moment a task from `projecttracking.md` is successfully implemented, you MUST halt and proactively ask the human:
> "Task complete. Shall we `wrap task` (sync state and continue) or `end session` (sync state and exit)?"

### 6B. Task Wrap Protocol (Continuous Execution)
If the human confirms "wrap task", you must:
1. Update `projecttracking.md` (mark task done).
2. Update `BUGS.md` (if any were found/fixed).
3. Update `CHANGELOG.md` (record what was done).
4. Commit the changes referencing the task ID.
5. Recalculate the base `nhash` based on the newly updated files, ask the human for the salt, and update the internal `[Hard State]` anchor. 
6. Output a visual checklist of the current milestone's tasks and their status from `projecttracking.md`.
7. Output: "Task wrapped. State synced. Ready for next task."

### 6C. Session End Protocol (Terminal Close)
If the human confirms "end session", perform all steps in 6B, PLUS:
1. Write `.dev/sessions/NEXT_SESSION.md` (last task, status, suggested next task).
2. Terminate the session-specific background MCP process:
   ```bash
   bash scripts/mbo-session-close.sh --terminate-mcp --agent=<claude|gemini>
   ```
   Do not verify the PID file. The script handles cleanup.
3. Output the END SESSION CHECKLIST.
4. State: "Handoff complete. It is now safe to clear context."

---

## Section 7 — Critical Constraints

1. `callModel` is the only path to any model. No direct API calls. Ever.
2. No file write outside approved scope. `writeFile` validates path before every write.
3. No code touches a real repository without human typing `go`.
4. Every model call logged to event store before and after.
5. Reviewer never sees planner output before Stage 4C — enforced at runtime, not just by type. See BUG-003.
6. Tier 0 requires safelist match, not just graph confirmation. See BUG-004.

---

## Section 8 — Required Affirmation

Before this session proceeds, you must physically read the required governance files. Do not guess. Do not rely on previous session memory. 

Report the following:

"I have read the documents. Here is the proof of state:
- AGENTS.md sections: [List the exact name of every NUMBERED section]. (Total: X)
- BUGS.md sections: [List the exact name of every section]. (Total: Y)
- NEXT_SESSION.md sections: [List the exact name of every section]. (Total: Z)

Base nhash: (X+Y+Z) × 3 = [Base Result]

I am ready for the verification salt."

Wait for the human. The human will provide a multiplier. You must calculate (Base nhash × multiplier) and output the final result. Only after the human confirms the math may the session proceed.

---

## Section 9 — Strict Mode (Code Output Constraints)

When proposing or writing code, agents must operate in Strict Mode:

1. **Diff-Only Edits:** All modifications to existing code MUST be proposed as a unified diff. Do not use full-file replacements for targeted edits.
2. **Mandatory Peer Review:** For Tier 2 and Tier 3 tasks, the proposed diff MUST be independently reviewed by the peer agent (DID) and reconciled by the human Operator before implementation.
3. Do not suggest stylistic, linting, or "cleanliness" changes unless they fix a functional bug or improve performance by >10%.
4. If no functional logic needs changing, return "NO_CHANGE" instead of rewriting.
5. Never remove variable data from error strings (e.g., do not replace `${body}` with `'Unknown error'` unless the original caused a functional bug).

---

## Section 10 — Hard State Persistence Rule

Once the human confirms your final math calculation, that final number becomes your **Hard State Anchor**.

To ensure this state survives context summarization and prevents context drift, you must explicitly state this number at the beginning of every internal `<thinking>` block or major step you take for the rest of the session. 

Example: `<thinking>[Hard State: 384] Analyzing the file...`

If at any point you cannot recall the Hard State Anchor, or if your context window is cleared and you lose it, you are structurally compromised. You must immediately halt all work and state: "CONTEXT LOST. REQUESTING NEW NHASH PROTOCOL." You must not proceed until the verification handshake is performed again.

---

*Last updated: 2026-03-08*

---

## Section 11 — Graph-Assisted Context Loading (active after Milestone 0.4B)

**Prerequisite:** Milestone 0.4B complete. Dev-mode graph server running.

### Two graph instances — never conflate them

| Instance | DB path (relative to repo root) | Indexes | Purpose |
|----------|--------------------------------|---------|---------|
| **Dev graph** | `.dev/data/dev-graph.db` | `src/` + SPEC.md sections | Development tool — used by Claude/Gemini during Phase 1 |
| **Runtime graph** | `data/mirrorbox.db` | User's codebase | Product feature — built by MBO during onboarding |

`data/mirrorbox.db` is the product. Never query it for development context. Never write dev graph data into it.

### MCP setup (first-time on a new machine)

MCP configs are machine-local and gitignored. Create the appropriate file once after cloning.

**Claude Code** — create `.mcp.json` in the repo root:
```json
{
  "mcpServers": {
    "mbo-graph": {
      "command": "bash",
      "args": ["scripts/mbo-start.sh", "--mode=dev", "--agent=claude"],
      "cwd": "<absolute path to repo root>",
      "trust": true
    }
  }
}
```

**Gemini CLI** — create `.gemini/settings.json` in the repo root:
```json
{
  "mcpServers": {
    "mbo-graph": {
      "command": "bash",
      "args": ["scripts/mbo-start.sh", "--mode=dev", "--agent=gemini"],
      "cwd": "<absolute path to repo root>"
    }
  }
}
```

Both configs run `mbo-start.sh`, which is vendor-agnostic and self-locating. Only `cwd` is machine-specific. Once created, the server auto-starts on session open.

The MCP server exposes these tools (use these exact names — do not guess or invent tool names):

| Tool | What it does |
|------|-------------|
| `graph_search` | Find nodes by keyword — returns node IDs, types, paths |
| `graph_query_impact` | Given a node ID, return all nodes affected by a change |
| `graph_query_dependencies` | Return the full dependency chain for a file or function |
| `graph_query_callers` | Return all nodes that call a given function |
| `graph_query_coverage` | Return tests that cover a given function or file |

### Replacing full SPEC.md loads with graph queries

After 0.4B, agents must NOT load SPEC.md in full at session start. Run only the queries listed in NEXT_SESSION.md Section 1. Load only the files and SPEC sections those queries return. Stop there.

State: "Graph query complete. SPEC sections loaded: [X]. Source files in scope: [Y]."

Do NOT use any tool other than the five MCP tools listed above. Do NOT use codebase_investigator, grep, SearchText, ReadFolder, or any file-system exploration tool to load context.

### If the dev graph server is not running

Fall back to full SPEC.md load and state: "Dev graph unavailable — loading full SPEC.md."
Do not block work. Do not attempt to start the server without human instruction.

---

*Last updated: 2026-03-08*
