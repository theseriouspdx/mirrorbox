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

The MCP server starts automatically via CLI client config. Do not start it manually under normal conditions. Do not verify the PID file.

The first graph query in Section 11 confirms MCP is reachable. If it fails, attempt manual recovery (see recovery command below). If still unreachable after recovery, follow the Section 11 hard stop protocol. Do not load SPEC.md. Do not proceed until MCP is confirmed reachable.

**Known failure mode (BUG-044):** When a Gemini or Claude session pegs CPU (stuck node process), the MCP server becomes unresponsive without crashing. The supervisor does not restart it automatically. This will be resolved by a watchdog in Milestone 0.8. Until then:

**Immediate manual recovery (one command):**
```bash
# Targeted recovery: Kill ONLY the process bound to the MCP port (default 3737)
lsof -ti:3737 | xargs kill -9
```
Regular `kill` (SIGTERM) is ignored by a hung Gemini process. Always use `kill -9`. Then open a fresh Gemini terminal — MCP will auto-start.



**Multi-agent rule:** Do not call `mbo-session-close.sh --terminate-mcp` unless you are the last active agent. Check `.dev/run/` for other live PID files first. Killing MCP while another agent is active drops their session.

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
- Identify the first OPEN task in `projecttracking.md`. Derive a graph search term from the task description. Run `graph_search(<derived_term>)`.
- Load only what the query returns. Do not expand further.
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

### 6A. The Audit Gate (Completion Trigger)
The moment a task from `projecttracking.md` is successfully implemented and Stage 8 passes, halt and present the audit package:
1. Unified diff of all changes made (relative to pre-task HEAD).
2. Full output of `python3 bin/validator.py --all`.
3. One-paragraph summary: what changed, why, and what was validated.

State: "Audit package presented. Respond `approved` to sync state, or `reject` to roll back."

- `approved` → proceed immediately to §6B without further input.
- `reject` → run `git checkout HEAD` on all modified files; delete any files created during this task; state "Rolled back. Re-entering Stage 3." Return to §12 Step 3.

### 6B. State Sync (Automatic on Approval)
On `approved`, without waiting for additional human input:
1. Update `projecttracking.md` (mark task done).
2. Update `BUGS.md` (if any were found/fixed).
3. Update `CHANGELOG.md` (record what was done).
4. Commit the changes referencing the task ID.
5. Recalculate the base `nhash` based on the newly updated files, ask the human for the salt, and update the internal `[Hard State]` anchor.
6. Output a visual checklist of the current milestone's tasks and their status from `projecttracking.md`.
7. Ask: "State synced. Continue to next task, or end session?"

### 6C. Session End (Terminal Close)
If the human responds "end session" to the §6B prompt — state is already synced. Only:
1. Write `.dev/sessions/NEXT_SESSION.md` (last task, status, suggested next task).
2. Terminate the session-specific background MCP process:
   ```bash
   bash scripts/mbo-session-close.sh --terminate-mcp --agent=<claude|gemini>
   ```
   Do not verify the PID file. The script handles cleanup.
3. Output the END SESSION CHECKLIST.
4. State: "Handoff complete. It is now safe to clear context."

Do not repeat §6B state sync steps here. They are already complete.

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
- AGENTS.md sections: [List the exact name of every top-level integer section only — e.g. Section 1, Section 2. Do NOT count subsections like Section 1.5 or Section 8.1]. (Total: X)
- BUGS.md sections: [List the exact name of every top-level integer section only]. (Total: Y)
- NEXT_SESSION.md sections: [List the exact name of every top-level integer section only]. (Total: Z)

Base nhash: (X+Y+Z) × 3 = [Base Result]

I am ready for the verification salt."

Wait for the human. The human will provide a multiplier. You must calculate (Base nhash × multiplier) and output the final result. Only after the human confirms the math may the session proceed.

### Section 8.1 — Secrecy of State
The `nhash` calculation and the resulting **Hard State Anchor** are transient secrets. 
1. **No Persistence**: You MUST NOT document, persist, or commit the `nhash` calculation or its result in any file (including `NEXT_SESSION.md`, `CHANGELOG.md`, or `projecttracking.md`). 
2. **One-Way Disclosure**: The `nhash` is reported only to the human Operator during the Section 8 affirmation. 
3. **Hard State Only**: Once confirmed, the result exists only within the `[Hard State: X]` tag in your thinking blocks for the duration of the current session.

---

## Section 9 — Strict Mode (Code Output Constraints)

When proposing or writing code, agents must operate in Strict Mode:

1. **Diff-Only Edits:** All modifications to existing code MUST be proposed as a unified diff. Do not use full-file replacements for targeted edits.
2. **Mandatory Peer Review:** For Tier 2 and Tier 3 tasks, the proposed diff MUST be independently reviewed by the peer agent (DID) and reconciled by the human Operator before implementation.
3. Do not suggest stylistic, linting, or "cleanliness" changes unless they fix a functional bug or improve performance by >10%.
4. If no functional logic needs changing, return "NO_CHANGE" instead of rewriting.
5. Never remove variable data from error strings (e.g., do not replace `${body}` with `'Unknown error'` unless the original caused a functional bug).
6. No file of any kind — source, config, governance, scripts — is written, created, or modified without explicit human approval. Propose the change and wait. Do not proceed until the human approves. No exceptions.

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

### MCP setup

Run as a background task before starting a session:
```bash
bash scripts/mbo-start.sh --mode=dev --agent=<claude|gemini> &
```

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

Do NOT fall back to loading SPEC.md. Do NOT use FindFiles, grep, or any file-system tool to locate or read SPEC.md directly.

State: "Dev graph unavailable. Cannot load context. Awaiting human instruction to resolve MCP."

Stop. Wait for the human. Do not proceed with any task until MCP is confirmed reachable.

---

*Last updated: 2026-03-08*

### 2.1 The Ambiguity Gate (Anti-Assumption Protocol)
* **The Rule:** You must never resolve architectural or implementation ambiguity through silent assumption.
* **The Trigger:** If a user prompt, a `SPEC.md` requirement, or the retrieved `Graph Context` lacks specific constraints (e.g., missing error fallback logic, undefined token limits, or contradictory file paths), you MUST pause execution.
* **The Action:** You must output a `<CLARIFICATION_REQUIRED>` block detailing the specific missing information or ambiguity. You must ask numbered questions.
* **The Gate:** You may only proceed to planning or writing code *after* the user (the Architect) has explicitly answered the questions and resolved the ambiguity.

### 2.2 Context Verification before Action
* Before modifying any core system files (e.g., `mcp-server.js`, `schema.sql`), you must verify you have the latest state of that file via MCP read tools. Do not rely on your training data or previous session memory for current file state.

---

## Section 12 — MBO Operational Workflow (Sovereign Loop)

Every development session MUST follow this checklist. Failure to complete any step is a breach of the Sovereign Factory protocol.

1. **Identify Task**: Identify the Active Milestone and Task ID from \`projecttracking.md\`.
2. **Permission Check**: Run \`python3 bin/handshake.py <cell_name>\` for temporary write access (644).
3. **Derive & Propose**: Derive the solution from graph context. Propose a diff-only implementation.
4. **Human Approval**: Obtain explicit "go" from the human Architect.
5. **Implement & Validate**: Apply changes. Run \`python3 bin/validator.py --all\` to ensure \`ENTROPY TAX: PAID\`.
5.5. **Audit Gate**: Present audit package per §6A (diff + validator output + summary). Wait for \`approved\` or \`reject\`. On \`reject\`: rollback all changes, return to Step 3.
6. **Sync State**: Update \`projecttracking.md\`, \`CHANGELOG.md\`, and \`BUGS.md\`. (Reached only after \`approved\`.)
7. **Lock & Journal**: Run \`python3 bin/handshake.py --revoke\` to return \`/src\` to read-only (444).
8. **Baseline**: Run \`python3 bin/init_state.py\` to freeze the codebase and update \`.journal/audit.log\`.

**STATUS: SOVEREIGN FACTORY ACTIVE.**

---

*Last updated: 2026-03-10*
