# DID Protocol Implementation — Preflight Prompt
## Task: 1.1-H24 — Wire DID into the MBO Operator Pipeline

**Date:** 2026-03-13
**Approved by:** Human Operator
**Tier:** 3 — Architecture change, DID required (ironic but correct)
**Status:** READY FOR DID DERIVATION
**Design doc:** `.dev/governance/DID-PROTOCOL.pdf`

---

## Context

The DID protocol has been designed and documented (Task 1.1-H14). It describes a
three-agent pipeline: Gemini (A) proposes, Claude (B) derives blind, human
reconciles, Codex breaks ties. That doc is the spec. This preflight is the
implementation work order.

Currently the Operator pipeline has no concept of agent roles, blind derivation,
or structured reconciliation. A single agent drives all stages. This task wires
the DID protocol into the Operator so that Tier 2/3 tasks automatically trigger
the correct multi-agent flow rather than relying on the human to manually
orchestrate it.

---

## What Needs to Be Built

### 1. Tier detection in `src/auth/operator.js`

The Operator must read the task's tier from `projecttracking.md` before routing.

```
function detectTier(taskId) {
  // Read projecttracking.md, find the task row
  // Extract tier annotation — e.g. "Tier 3" in the description or a new column
  // Return: 0 | 1 | 2 | 3
}
```

For now, tier is encoded in the task description as "Tier N" or inferred from
keywords: "Architecture", "governance", "AGENTS.md", "SPEC.md" → Tier 3.
Multi-file changes without those keywords → Tier 2. Single file → Tier 1. Docs → Tier 0.

### 2. Agent role assignment

When tier >= 2, the Operator assigns roles before Stage 3 (planning):

- **Agent A (Gemini):** Receives the task context. Produces a unified diff + rationale.
  Context is written to `.dev/did/[taskId]/agent-a-context.md`.
  Output is written to `.dev/did/[taskId]/agent-a-diff.md`.

- **Agent B (Claude):** Receives identical task context but NO Agent A output.
  Context is written to `.dev/did/[taskId]/agent-b-context.md` (same content as A).
  Output is written to `.dev/did/[taskId]/agent-b-diff.md`.

The Operator must enforce that agent-b-context.md does NOT include agent-a-diff.md.
This is the blind derivation guarantee. It is enforced structurally, not by trust.

### 3. Context isolation mechanism

The Operator must spawn two separate `callModel` calls:

```javascript
// Agent A call — Gemini
const agentAResult = await callModel({
  role: 'did_agent_a',
  model: 'gemini',
  context: buildDIDContext(task, sourceFiles, preflightDoc),
  systemPrompt: DID_AGENT_A_PROMPT,
});

// Agent B call — Claude (blind: no agentAResult in context)
const agentBResult = await callModel({
  role: 'did_agent_b',
  model: 'claude',
  context: buildDIDContext(task, sourceFiles, preflightDoc), // identical to A
  systemPrompt: DID_AGENT_B_PROMPT,
});
```

`DID_AGENT_A_PROMPT` and `DID_AGENT_B_PROMPT` are defined in
`src/auth/did-prompts.js` (new file). See Section: Prompts below.

### 4. Reconciliation output

After both agents produce diffs, the Operator presents a structured reconciliation
package to the human — it does NOT auto-merge. Format:

```
=== DID RECONCILIATION PACKAGE — Task [taskId] ===

AGENT A (Gemini) DIFF:
[agent-a-diff.md contents]

AGENT A RATIONALE:
[one paragraph]

---

AGENT B (Claude) DIFF:
[agent-b-diff.md contents]

AGENT B RATIONALE:
[one paragraph]

---

CONFLICT ZONES (auto-detected):
[lines that differ between the two diffs, highlighted]

AGREEMENT ZONES (auto-detected):
[lines identical in both diffs]

Awaiting human reconciliation. Issue "go [diff]" with your reconciled diff,
or "retry claude [conflict zone]" to trigger Claude's one retry right.
```

### 5. Claude's retry right

If the human issues `retry claude [conflict zone]`, the Operator:
1. Calls Claude again with only the conflict zone and the original task context
2. Claude may NOT see Agent A's full diff — only the conflict zone text
3. Claude's revised output replaces `agent-b-diff.md`
4. Reconciliation package is re-presented to the human

This is enforced by the `retryClause` flag in the second `callModel` call.
Only one retry is permitted per DID pass. A second `retry claude` command is
rejected with: "Claude has used its retry right. Issue `tiebreaker codex` to
call the tiebreaker, or manually reconcile."

### 6. Codex tiebreaker

If the human issues `tiebreaker codex [conflict zone]`, the Operator:
1. Calls Codex with only the conflict zone and preflight acceptance criteria
2. Codex output is written to `.dev/did/[taskId]/codex-tiebreaker.md`
3. Reconciliation package is re-presented with all three outputs

The human then issues `go [diff]` with their final reconciled diff.

---

## Files to Create

### `src/auth/did-prompts.js` (new)
Contains the system prompts for Agent A, Agent B, and the Codex tiebreaker.
Each prompt must enforce the output format: unified diff + one-paragraph rationale, nothing else.

### `src/auth/did-orchestrator.js` (new)
The DID state machine. Handles: tier detection, role assignment, context isolation,
reconciliation package formatting, retry gate, tiebreaker invocation.

### `.dev/did/` (new directory)
Ephemeral working directory for DID sessions. One subdirectory per task.
Contents: `agent-a-context.md`, `agent-a-diff.md`, `agent-b-context.md`,
`agent-b-diff.md`, `reconciled-diff.md` (written on human "go"), `codex-tiebreaker.md` (if used).
This directory is gitignored — it is a working scratchpad, not a permanent record.

---

## Files to Modify

### `src/auth/operator.js`
- Add tier detection before Stage 3
- Branch: tier >= 2 → hand off to `did-orchestrator.js`
- Branch: tier <= 1 → existing single-agent flow unchanged
- Add command handlers: `retry claude`, `tiebreaker codex`, `go [diff]` in DID context

### `.gitignore`
Add `.dev/did/` to gitignore.

---

## Prompts

### DID_AGENT_A_PROMPT (Gemini — role: proposer)
```
You are Agent A in a Dual Independent Derivation (DID) pass for MBO.
Your role: read the task context and produce an implementation.

Rules:
- Output a unified diff of your proposed changes. Nothing else.
- Follow with exactly one paragraph of rationale (why this satisfies the acceptance criteria).
- Do not ask clarifying questions. Derive from the preflight doc and source files.
- Do not produce prose explanations, architecture lectures, or bullet points.
- Format: diff block, then rationale paragraph. Two artifacts only.
```

### DID_AGENT_B_PROMPT (Claude — role: blind reviewer)
```
You are Agent B in a Dual Independent Derivation (DID) pass for MBO.
Your role: independently derive an implementation of the same task.

Rules:
- You have NOT seen Agent A's output. Do not ask for it.
- Read only the task context provided. Derive independently.
- Output a unified diff of your proposed changes. Nothing else.
- Follow with exactly one paragraph of rationale.
- Do not ask clarifying questions. Derive from the preflight doc and source files.
- Format: diff block, then rationale paragraph. Two artifacts only.
```

### DID_CODEX_TIEBREAKER_PROMPT
```
You are the tiebreaker in a Dual Independent Derivation (DID) pass for MBO.
Two agents derived conflicting implementations. Your output breaks the tie.

Rules:
- You will be shown only the conflict zone — the specific lines where the two agents disagree.
- Derive your own implementation of the conflict zone.
- Output a unified diff of the conflicted section only. Nothing else.
- Follow with exactly one sentence explaining your choice.
- Do not explain both sides. Pick one approach and implement it.
```

---

## Acceptance Criteria (all must pass)

1. A Tier 3 task triggers DID automatically — Operator presents reconciliation package without human having to manually orchestrate two sessions
2. Agent B's `callModel` call contains no output from Agent A — verified by inspecting `agent-b-context.md`
3. `.dev/did/[taskId]/` is created and populated correctly for each DID pass
4. `retry claude` is rejected after it has already been used once in the same DID pass
5. `tiebreaker codex` produces a Codex-only derivation with no Agent A or B diffs in its context
6. A Tier 0/1 task skips DID entirely and uses the existing single-agent flow
7. `python3 bin/validator.py --all` passes after implementation
8. `node --check src/auth/did-orchestrator.js` passes
9. `node --check src/auth/did-prompts.js` passes
10. The reconciliation package renders clearly in the terminal — human can read both diffs and conflict zones without additional tooling

---

## DID Protocol for This Task

This task is itself a Tier 3 change (new orchestration architecture, touches
`operator.js`, adds new auth modules). DID is required to implement it.

Agent A (Gemini): read this doc, read `src/auth/operator.js`, derive the
implementation of `did-orchestrator.js` and the `operator.js` changes.

Agent B (Claude): same sources, no Agent A output visible, derive independently.

Human reconciles. Then: `go [reconciled diff]`.

---

*Written: 2026-03-13*
*Do not implement without human "go" and DID reconciliation*
