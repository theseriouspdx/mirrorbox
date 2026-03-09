# AGENTS.md
## Mirror Box Orchestrator — Agent Rules and Constraints

**Scope:** This file governs all agents working on the MBO codebase during Phase 1 development. Read at the start of every session before any code is written.

---

## Section 1 — Session Start Protocol

Every development session begins in this order. No exceptions.

1. Read this file (`.dev/governance/AGENTS.md`)
2. Read `.dev/governance/projecttracking.md` — identify current milestone and active task
3. Read `.dev/governance/BUGS.md` — check for anything P0 blocking current milestone
4. Read `.dev/spec/SPEC.md` — the implementation contract is the source of truth

No code is written before this sequence completes.

---

## Section 2 — Development Protocol & Routing Tiers

**Every task must exist in `projecttracking.md` before code is written.**

Before executing a task, the human Operator determines the Routing Tier based on risk and blast radius:

**Tier 0 & 1 (Low Risk / Single File / Docs):** Gemini CLI proposes the implementation and writes the diff. If the human approves, Gemini implements it directly. No Claude review required.

**Tier 2 & 3 (High Risk / Multi-File / Architecture):**
1. Gemini CLI proposes the implementation and writes the diff.
2. Gemini MUST halt and state: "HALTING FOR CLAUDE REVIEW. Please pass this diff to Claude."
3. The human passes the diff, task description, and spec to Claude Code.
4. Claude Code reviews blind against the spec.
   - Claude passes → human tells Gemini to implement.
   - Claude blocks → human feeds block to Gemini, Gemini revises.
   - 3 blocks → escalate to human. Do not implement until resolved.

---

## Section 3 — What Agents Can and Cannot Do

| Agent | Can | Cannot |
|-------|-----|--------|
| Gemini CLI | Primary driver. Propose implementations, write diffs, read all .dev/ files | Write to src/ without task in projecttracking.md |
| Claude Code | Escalation reviewer. Review diffs against spec, flag violations, propose alternatives | See Gemini's reasoning before producing its own review |
| Either | Read SPEC.md, BUGS.md, projecttracking.md, AGENTS.md | Modify governance docs without human approval |

---

## Section 4 — Spec Is Source of Truth

If implementation conflicts with spec, the spec wins. If the spec is wrong, stop. File the bug in BUGS.md. If P0: fix the spec before writing the fix. Do not implement workarounds to spec bugs.

---

## Section 5 — Proactive State Sync & Session Protocols

To minimize human cognitive load and maximize token efficiency, the agent must drive the workflow transitions. The human acts as the approval gate, not the workflow engine.

### 5A. The Completion Prompt
The moment a task from `projecttracking.md` is successfully implemented, you (the agent) MUST halt and proactively ask the human:
> "Task complete. Shall we `wrap task` (sync state and continue) or `end session` (sync state and exit)?"

### 5B. Task Wrap Protocol (Continuous Execution)
If the human confirms "wrap task", you must:
1. Update `projecttracking.md` (mark task done).
2. Update `BUGS.md` (if any were found/fixed).
3. Update `CHANGELOG.md` (record what was done).
4. Commit the changes referencing the task ID.
5. Recalculate the base `nhash` based on the newly updated files, ask the human for the salt, and update the internal `[Hard State]` anchor. 
6. Output: "Task wrapped. State synced. Ready for next task."

### 5C. Session End Protocol (Terminal Close)
If the human confirms "end session", perform all steps in 5B, PLUS:
1. Write `.dev/sessions/NEXT_SESSION.md` (last task, status, suggested next task).
2. Output the END SESSION CHECKLIST.
3. State: "Handoff complete. It is now safe to clear context."

---

## Section 6 — Critical Constraints

1. `callModel` is the only path to any model. No direct API calls. Ever.
2. No file write outside approved scope. `writeFile` validates path before every write.
3. No code touches a real repository without human typing `go`.
4. Every model call logged to event store before and after.
5. Reviewer never sees planner output before Stage 4C — enforced at runtime, not just by type. See BUG-003.
6. Tier 0 requires safelist match, not just graph confirmation. See BUG-004.

---

## Section 7 — Required Affirmation

Before this session proceeds, you must physically read the required governance files. Do not guess. Do not rely on previous session memory. 

Report the following:

"I have read the documents. Here is the proof of state:
- AGENTS.md sections: [List the exact name of every NUMBERED section]. (Total: X)
- BUGS.md sections: [List the exact name of every NUMBERED section]. (Total: Y)
- NEXT_SESSION.md sections: [List the exact name of every NUMBERED section]. (Total: Z)

Base nhash: (X+Y+Z) × 3 = [Base Result]

I am ready for the verification salt."

Wait for the human. The human will provide a multiplier. You must calculate (Base nhash × multiplier) and output the final result. Only after the human confirms the math may the session proceed.

---

## Section 8 — Hard State Persistence Rule

Once the human confirms your final math calculation, that final number becomes your **Hard State Anchor**.

To ensure this state survives context summarization and prevents context drift, you must explicitly state this number at the beginning of every internal `<thinking>` block or major step you take for the rest of the session. 

Example: `<thinking>[Hard State: 384] Analyzing the file...`

If at any point you cannot recall the Hard State Anchor, or if your context window is cleared and you lose it, you are structurally compromised. You must immediately halt all work and state: "CONTEXT LOST. REQUESTING NEW NHASH PROTOCOL." You must not proceed until the verification handshake is performed again.

---

*Last updated: 2026-03-08*