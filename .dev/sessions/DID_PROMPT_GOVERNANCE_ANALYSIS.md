# DID PROMPT — Governance Analysis
## Blind Derivation Task for Agent B
## Date: 2026-03-18 | Tier: 3 | DID Required

---

## CRITICAL INSTRUCTION

You are Agent B performing a **blind independent derivation**.

Do NOT read `.dev/governance/ANALYSIS_HANDOFF_20260318.md` before completing
your own analysis. That file contains Agent A's findings. You must arrive at
your own conclusions first. After you submit your complete analysis, the human
Operator will reconcile both versions.

This is the DID protocol in action on the governance docs themselves.

---

## CONTEXT

MBO is undergoing an architectural pivot:

**From:** Process-based trust model (agents manage filesystem, MCP lifecycle, etc.)
**To:** API-native payload-based trust model

Core insight: Agents are stateless text generators over the wire. They cannot
touch the filesystem. The only dangerous moment is the write step. The
verification stack collapses to one hard gate at the write step. Everything
before it is text in, text out.

The governance document structure is also collapsing from its current sprawl
into three documents:
- `AGENTS.md` — roles and permissions
- `STATE.md` — current project state  
- `SPEC.md` — implementation contract (gate spec lives here as a section)

---

## YOUR TASK — THREE PARTS, SEQUENTIAL

### PART 1 — Bug Triage

Read these two files:
- `/Users/johnserious/mbo/.dev/governance/BUGS.md`
- `/Users/johnserious/mbo/.dev/governance/projecttracking.md`

For every OPEN bug, classify it as:
- **MOOT** — the API-native redesign already solves this structurally
- **REQUIRED** — must be resolved before MBO can self-build via onboarding
- **BLOCKED** — depends on redesign decisions not yet made

**Important:** Do not just read the bug descriptions. Check the actual code at
the locations specified in each bug. The BUGS.md status field is not reliable —
it is known to lag behind code reality. Your triage must reflect what the code
actually does, not what the doc claims.

Key files to check against bug claims:
- `src/cli/onboarding.js`
- `src/graph/mcp-server.js`
- `scripts/mcp_query.js`
- `scripts/mbo-session-close.sh`
- `bin/mbo.js`
- `package.json`

Stop here. Surface your triage. Wait for human to say continue.

---

### PART 2 — Governance Collapse

Read ALL of the following before drafting anything:
- `/Users/johnserious/mbo/.dev/governance/AGENTS.md`
- `/Users/johnserious/mbo/AGENTS.md`
- `/Users/johnserious/mbo/.dev/spec/SPEC.md`
- `/Users/johnserious/mbo/.dev/governance/projecttracking.md`
- `/Users/johnserious/mbo/.dev/governance/BUGS.md`
- `/Users/johnserious/mbo/.dev/governance/DESIGN_DECISIONS.md`
- `/Users/johnserious/mbo/.dev/governance/TECHNICAL_DEBT.md`
- `/Users/johnserious/mbo/NEXT_SESSION.md`
- `/Users/johnserious/mbo/.dev/sessions/NEXT_SESSION.md`
- `/Users/johnserious/mbo/data/NEXT_SESSION.md`
- `/Users/johnserious/mbo/ROADMAP.md`
- `/Users/johnserious/mbo/letsgo.md`
- `/Users/johnserious/mbo/docs/operator-guide.md`
- `/Users/johnserious/mbo/docs/mcp.md`
- `/Users/johnserious/mbo/docs/agent-onboarding.md`
- `/Users/johnserious/mbo/.dev/preflight/onboarding-conversational-model.md`
- `/Users/johnserious/mbo/.dev/preflight/mcp-daemon-migration.md`
- `/Users/johnserious/mbo/personalities/onboarding.md`
- `/Users/johnserious/mbo/.gitignore`

Your job: produce a complete inventory of every conflict, duplication, drift,
and structural problem across all governance documents.

Two architectural decisions have already been made by the human Operator.
Work with these as fixed constraints, do not re-derive them:

**DECISION A:** All MBO files in client projects live in `.mbo/`. Nothing
MBO-authored goes in the project root. The project root belongs to the project
owner.

**DECISION B:** There is one canonical AGENTS.md source:
`.dev/governance/AGENTS.md` — hand-authored, never ships to client projects.
The root `AGENTS.md` in client projects is a GENERATED ARTIFACT produced by
`mbo setup` / onboarding, scoped to that project (roles, permissions, prime
directive, danger zones, verification commands). It is not a copy of the dev
governance doc — it is a different document with a different job.
SPEC Section 8 already specifies this behavior ("operator drafts AGENTS.md as
part of onboarding") — it was just never implemented correctly.

For everything else you find: flag it, describe the conflict or drift, but do
NOT resolve it yourself. Surface it for human decision.

Draft the collapse into three documents (AGENTS.md, STATE.md, SPEC.md).
Show the structure and key decisions required. Do not write the final docs yet.

Stop here. Surface the draft. Wait for human to say continue.

---

### PART 3 — Spec Integration

Integrate the API-native pipeline redesign and the three-zone model into SPEC.md.
The gate spec lives as a section in SPEC.md, not a standalone document.
Flag anything that contradicts existing sections.

Stop here. Surface for human review. Full stop.

---

## ADDITIONAL CONTEXT: Known Design Decisions Already Made

These were approved by the human Operator in prior sessions. Treat them as
settled architecture, not open questions:

1. **launchd owns the MCP server.** MBO does not start, stop, or manage the
   MCP process. This supersedes Section 32 of SPEC.md (already marked
   SUPERSEDED in the doc).

2. **Ephemeral ports with manifest discovery.** No fixed port. Each project
   daemon binds `--port=0`, writes manifest. See Section 6 port history table.
   Do not reference port 7337 as current.

3. **Onboarding is LLM-driven (thin shell).** The interview logic lives in the
   LLM prompt, not in code state machines. Code provides scan, prompt I/O,
   and persistence plumbing only. See `.dev/preflight/onboarding-conversational-model.md`.

4. **Section 36 is the binding onboarding contract.** It supersedes all prior
   informal onboarding descriptions anywhere in the codebase.

5. **Background enrichment for rescan.** LSP enrichment runs at onboarding
   (full) and as fire-and-forget `.catch()` on subsequent rescans. Changed-file
   rescans are static-only and must complete in seconds.

6. **DB Write Prohibition.** Agents MUST NOT write directly to any database.
   The tasks table and all pipeline state is seeded by the Operator from
   projecttracking.md. This is a hard invariant.

7. **Worktree isolation.** All implementation work occurs in a dedicated git
   worktree (`git worktree add .dev/worktree/<agent>-<task>`), not just a
   branch. Concurrent agents must never share a working directory.

---

## WHERE TO SAVE YOUR OUTPUT

Save your complete analysis to:
`/Users/johnserious/mbo/.dev/governance/DID_OUTPUT_AGENTB_20260318.md`

This is your working artifact. The human Operator will reconcile it against
Agent A's output (in ANALYSIS_HANDOFF_20260318.md) after you complete all
three parts.

---

*DID prompt authored: 2026-03-18*
*DO NOT READ ANALYSIS_HANDOFF_20260318.md until your analysis is complete*
