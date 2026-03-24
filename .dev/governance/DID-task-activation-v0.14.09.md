# DID Task Brief: First-Class Task Activation Pathway
**Date:** 2026-03-24
**Initiated by:** Operator (John)
**Process:** Dual Independent Derivation — two agents produce independent designs, then compare.

---

## Problem Statement

When a user selects a task from the TUI (via `/tasks` overlay or by typing a task ID like `v0.13.02`), the system builds a structured activation prompt via `buildTaskActivationPrompt()` in `src/tui/governance.ts` and passes it to `operator.processMessage()`. The operator then treats this structured, governance-sourced prompt as if it were freeform human text — running it through the full LLM-backed classifier (`classifyRequest()`), which demands file paths, confidence thresholds, and routing decisions designed for ad-hoc input.

**The result:** The classifier returns `needsClarification: true` with the message "The standard route requires at least one file path to proceed. Please specify which files should be modified." This is presented to the user as if they said something ambiguous. They didn't. They selected a governance-tracked task with defined scope, acceptance criteria, and often proposed files. The clarification is nonsensical and blocks the workflow.

**An ad-hoc regex bypass was attempted** (commit `2a102f9`, BUG-221) but it does not work reliably and is architecturally wrong — it adds pattern-matching to `processMessage()` to detect activation prompts before they reach the classifier. This is fragile, creates coupling between the TUI's prompt format and the operator's internals, and doesn't address the fundamental issue.

---

## Root Cause Analysis

There is no dedicated task activation entry point in the operator. Everything enters through `processMessage(userMessage)` which assumes freeform text. The function has a long chain of early returns (onboarding check → clarification followup → sandbox intercept → state machine transitions → session history → classifier → routing), and a governance-sourced task activation prompt must survive all of these to reach the pipeline.

The classifier (`classifyRequest()` at line 1031 of `operator.js`) calls an LLM to produce a `Classification` object. For mutation routes (`standard`, `complex`), it requires a non-empty `files[]` array (line 1082-1090). Most governance tasks — especially planning tasks, config tasks, and new features — don't come with pre-identified file paths. The classifier was designed for humans typing things like "fix the bug in App.tsx" where file extraction is natural. It was not designed for structured task briefs where the scope is defined by governance, not by file paths.

---

## What SPEC Already Says

**Section 8 — Classification Output Schema:**
```typescript
interface Classification {
  route: 'inline' | 'analysis' | 'standard' | 'complex';
  risk: 'low' | 'medium' | 'high';
  complexity: 1 | 2 | 3;
  files: string[];
  rationale: string;
  confidence: number;
}
```

**Section 15, Stage 1 — Request Classification:**
"The user's request is parsed into a Classification object (Section 8). Logged to the event store before the pipeline proceeds."

**Section 37.3B — Task Activation Preflight Dialogue (Approved Direction):**
"Tasks overlay is a navigator. On task selection (Enter), the system MUST aggregate context from: selected row in projecttracking.md, linked entry in BUGS.md, linked entry in BUGS-resolved.md (if applicable), relevant section in SPEC.md. Confirmation dialogue contract: Briefing includes goal, assumptions, acceptance, and proposed files. Operator can add context/files and correct assumptions. Explicit confirmation is required before task context activation."

**What SPEC does NOT say:** How a confirmed task activation enters the operator pipeline. The spec defines the preflight dialogue but not the handoff. `processMessage()` is the only entry point, and it was designed for freeform text.

---

## Relevant Code Locations

| File | What | Lines |
|------|------|-------|
| `src/auth/operator.js` | `processMessage()` — the only pipeline entry point | ~1591–1690 |
| `src/auth/operator.js` | `classifyRequest()` — LLM-backed classifier with file-path gate | ~1031–1097 |
| `src/auth/operator.js` | `_handleClarificationFollowup()` — catches confused follow-ups | ~1727–1755 |
| `src/auth/operator.js` | `handleApproval()` — processes `go` to start pipeline execution | (search for it) |
| `src/auth/operator.js` | `determineRouting()` — maps classification to tier | (search for it) |
| `src/tui/App.tsx` | `activateTask()` — TUI callback that calls `operator.processMessage(prompt)` | ~302–326 |
| `src/tui/App.tsx` | `handleInput()` — input bar handler, digit 1-4 conflict with tab switching | ~360–420 |
| `src/tui/governance.ts` | `buildTaskActivationPrompt()` — assembles the activation prompt | ~234–282 |
| `src/tui/components/TasksOverlay.tsx` | `/tasks` overlay — navigates and selects tasks | full file |
| `.dev/spec/SPEC.md` | Classification schema, routing tiers, pipeline stages, task activation preflight | Sections 8, 15, 37.3B |

---

## Additional TUI Issues (same scope)

These are related UX failures that surfaced during the same testing session and share the same root cause (the TUI-to-operator handoff is broken):

1. **Startup task list is not selectable.** The operator panel shows tasks on startup as plain text. Users expect to select them (arrow keys, click, or at minimum type a number). Digits 1-4 are currently consumed by tab switching (`handleInput` lines 366-381), so even a numbered-shortcut approach conflicts.

2. **Layout proportions.** The right stats panel is `width="35%"` which is too wide for its content, squeezing the operator panel. At narrow terminals, both panels are cramped.

3. **Terminal too-small behavior.** Currently shows a static warning. Should auto-resize the terminal window to minimum usable size (100×30), or degrade gracefully.

4. **BUG-### identifiers not shown** in the startup task listing or activation flow for bug-type tasks.

---

## Constraints

- `src/auth/` files are locked (444 permissions). Any changes require `mbo auth src` + operator `go`. Propose diffs, do not apply.
- The solution must work for ALL task types in `projecttracking.md`: bugs, features, chores, plans, audits, docs.
- The solution must not break freeform text input — users must still be able to type ad-hoc requests.
- The solution must respect the SPEC's pipeline stage sequence (Classification → Context Pinning → Planning → ...).
- The SPEC may need new or updated sections to define the task activation entry point contract. If so, propose the spec changes.
- Version lane rule: TUI changes are `v0.3.x`, operator/workflow changes are `v0.11.x` or `v0.14.x`.

---

## Deliverable

A design document that defines:

1. **How a governance-sourced task activation enters the operator pipeline** — the architectural contract, not a regex hack.
2. **What changes to SPEC.md are needed** to formalize this entry point.
3. **What changes to operator.js are needed** — method signatures, new methods, or refactored flow.
4. **What changes to the TUI are needed** — how task selection works from both the startup listing and the /tasks overlay, including the tab-switching conflict.
5. **Layout and terminal sizing** — how the TUI handles different terminal sizes.
6. **All failure modes identified and addressed** — what happens when a task has no files, no acceptance, no spec excerpt, conflicting data, etc.

---

## Mandate

> Identify all failure modes in your solution and solve for each one before submitting.

This is non-negotiable. It applies at every stage: plan derivation, code derivation, review, tiebreaking.
