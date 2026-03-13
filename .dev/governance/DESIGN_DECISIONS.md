# DESIGN_DECISIONS.md
## Mirror Box Orchestrator — Architectural Design Record

**Purpose:** Captures design decisions made in conversation before they become SPEC sections or tasks.
This file is `.dev/` only — it is build tooling, not product. Never ship this.

---

## DDR-001 — Conversational Agent Output Layer
**Date:** 2026-03-12
**Status:** APPROVED — pending SPEC section and task creation
**Session:** Claude Desktop, session ending ~2026-03-12T18:xx

### Decision
JSON is not the user-facing output format for agent interactions.
The inter-agent conversation IS the product experience, not an internal implementation detail.

### Context
The current architecture uses JSON for all agent outputs — classification, planner, reviewer,
tiebreaker. This made sense when the assumption was "the Operator parses everything
programmatically and humans never see raw model output." That assumption is wrong for the
target user experience.

What works well in the current dev workflow is the conversational nature of it. Users are
human. The conversation between agents should be in plain English, not JSON.

### What Changes
Agents produce natural language responses in their assigned persona.
The Operator gains an internal extraction step that pulls structured decisions out of
natural language responses — replacing the current requirement that models produce
valid JSON directly.

`validateOutputSchema()` in `call-model.js` shifts from:
  "did the model return valid JSON?"
to:
  "did the Operator successfully extract a decision from the response?"

### What Stays The Same
- Pipeline logic and tier routing
- Blast radius checks
- Audit gate and human approval
- Event logging
- All invariants

### Why This Is More Robust
Models hallucinate JSON structure under pressure. They rarely fail to express
an opinion in plain English. Natural language → extraction is a more reliable
path than requiring structured output directly.

### Implementation Shape
1. Each role gets a persona system prompt (see DDR-002)
2. Model produces natural language response in persona
3. Operator runs lightweight extraction pass to pull structured decision
4. Extracted decision written to event store as before
5. Natural language response surfaced to user as the visible conversation

---


## DDR-002 — Persona System
**Date:** 2026-03-12
**Status:** APPROVED — pending SPEC section and task creation

### Decision
Agent personas are user-editable, community-shareable, and eventually UI-selectable.
The persona is not decoration — it is a reasoning constraint that shapes agent behavior.

### Arc
- **Now (Phase 3 dev):** Persona prompts as plain text files in `.dev/governance/personas/`
- **Near term:** User-editable persona config in `~/.orchestrator/personas/`
- **Eventually:** UI element — browse pre-built personas or generate your own

### The "Generate Your Own" Path
The onboarding interview asks: "How do you want your agents to communicate with you?"
The system generates a persona prompt from that description using the best available model.
The generated persona is stored in the user's config and injected into every relevant
agent call from that point forward.

This is tight: the persona itself is created by a model, stored, and then shapes every
subsequent interaction.

### Persona as Structural Constraint — The Katt Williams Example
A strongly opinionated adversarial persona (e.g. Katt Williams) is structurally better
at the Reviewer role than a polite neutral reviewer. The persona is resistant to social
pressure and groupthink by design. The comedy is a side effect — the real value is
that a reviewer who "doesn't care whose feelings get hurt" is harder to capture
with the planner's framing.

Persona = reasoning constraint + communication style, not just communication style.

### Onboarding Profile Schema Addition
`personaConfig` field to be added to `OnboardingProfile`:

```typescript
personaConfig?: {
  reviewer?: PersonaRef;        // who reviews proposals
  planner?: PersonaRef;         // who plans implementations
  tiebreaker?: PersonaRef;      // who adjudicates
  operator?: PersonaRef;        // how the operator communicates
}

interface PersonaRef {
  id: string;                   // e.g. "katt-williams" | "custom-uuid"
  name: string;                 // display name
  source: 'builtin' | 'generated' | 'community' | 'user';
  promptPath: string;           // path to persona system prompt file
  generatedFrom?: string;       // original user description if source=generated
}
```

### Community Sharing
Phase 1: Plain text files people share however they want (GitHub, Discord, etc.)
Phase 2: UI element — browse pre-established personas or generate your own
No marketplace infrastructure required initially — file format standardization is enough.

---

## DDR-003 — Dev Workflow Alignment With Runtime Pipeline
**Date:** 2026-03-12
**Status:** APPROVED — pending task creation

### Decision
The development workflow (Claude/Gemini building MBO) should use the same pipeline
structure as the runtime workflow (MBO building user projects).

### Context
The current dev workflow is an informal version of the runtime pipeline:
- Work with one agent to understand the problem
- That agent distills the conversation into a neutral problem-statement prompt
  (no solution leaked — problem context only)
- Run that prompt against both agents independently (blind)
- Compare results, ask for agreement on best method
- If friction remains → bring in a third agent as tiebreaker

This IS the runtime pipeline. The runtime pipeline formalizes it:
- Operator builds graph context (= agent distills problem statement)
- PlannerInput has no prior solution (= blind derivation)
- Reviewer derives independently (= second agent blind)
- Gate 2 consensus (= agreement on best method)
- Tiebreaker = third agent

### Gap
The distilled problem-statement prompt is not currently standardized or saved anywhere.
It lives only in conversation and gets manually copy-pasted. This should be formalized
as a `.dev/preflight/` artifact with a standard format.

### Blocker
The Sovereign Loop (1.0-09) must be stable before dev tasks can route through the
runtime pipeline. Current status: MCP is in incident state (see BUG-057).
The pipeline is at classification stage with skeleton graph only.

### Next Step
Fix BUG-057 first. Then evaluate routing H12/H13/H14 through the pipeline itself
as the first proof of "MBO develops itself via MBO."

---


## DDR-002 — Persona System (updated)
**Date:** 2026-03-12
**Status:** APPROVED — pending SPEC section and task creation

### Decision
Agent personas are user-editable, community-shareable, and eventually UI-selectable.
The persona is not decoration — it is a reasoning constraint that shapes agent behavior.

### Config Split — Two Levels

```
~/.orchestrator/
  config.json          ← model routing, API keys (already in SPEC)
  personas/            ← user's persona LIBRARY (definitions live here)
    katt-williams.md
    socratic.md
    custom-uuid.md

.mbo/                  ← project-level runtime state (already exists)
  mirrorbox.db
  stats.json
  persona.json         ← which personas THIS project uses (refs only, not definitions)
```

**Definitions** live in `~/.orchestrator/personas/` — write once, available to all projects.
**Assignments** live in `.mbo/persona.json` — which persona does this project use per role.

This means:
- A team member who clones the repo gets the same persona *assignments*
- They source definitions from their own `~/.orchestrator/personas/`
- If a ref doesn't exist locally, MBO prompts them to install it or falls back to default
- Community sharing = drop a `.md` file into `~/.orchestrator/personas/`, done

### Why Not Everything In ~/.orchestrator/
`.mbo/` is already project-scoped runtime state. Persona assignments belong there
because different projects legitimately want different reviewer personalities —
a legacy PHP codebase and a greenfield React app may call for very different agents.
The assignment travels with the project. The definition stays with the user.

### Why Not Everything In .mbo/
Persona definitions shouldn't be duplicated across 10 projects. If you update
your Katt Williams persona prompt, you want it updated everywhere, not in each
`.mbo/` directory separately.

### Arc
- **Now (Phase 3 dev):** Persona prompts as `.md` files in `.dev/governance/personas/`
- **Near term:** User persona library in `~/.orchestrator/personas/`,
  project assignments in `.mbo/persona.json`
- **Eventually:** UI element — browse pre-built personas or generate your own

### The "Generate Your Own" Path
Onboarding asks: "How do you want your agents to communicate with you?"
System generates a persona prompt from the description using best available model.
Generated persona stored in `~/.orchestrator/personas/<uuid>.md`.
`.mbo/persona.json` updated to reference the new persona for this project.

### Persona as Structural Constraint — The Katt Williams Example
A strongly opinionated adversarial persona is structurally better at the Reviewer
role than a polite neutral reviewer. Resistant to groupthink by design.
The comedy is a side effect. The real value is that a reviewer who doesn't hedge
is harder to capture with the planner's framing.

Persona = reasoning constraint + communication style. Not just style.

### `.mbo/persona.json` Schema
```json
{
  "reviewer": {
    "id": "katt-williams",
    "source": "community",
    "installedFrom": "~/.orchestrator/personas/katt-williams.md"
  },
  "planner": {
    "id": "default",
    "source": "builtin"
  },
  "tiebreaker": {
    "id": "socratic",
    "source": "user",
    "installedFrom": "~/.orchestrator/personas/socratic.md"
  },
  "operator": {
    "id": "default",
    "source": "builtin"
  }
}
```

### `~/.orchestrator/personas/<name>.md` Format
```markdown
---
id: katt-williams
name: Katt Williams
role_hint: reviewer
author: community
version: 1.0
---

You are reviewing a software implementation proposal.
Your communication style is direct, sharp, and comedic — you find the flaw
and you make sure everyone in the room knows about it. You do not soften bad news.
If the plan has a hole in it, you call it out immediately and specifically.
You still provide a constructive path forward — you just don't pretend the
problem wasn't there. Think: roast with receipts.
```

---
