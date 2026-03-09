# DID Pre-Build Analysis Prompt
## Mirror Box Orchestrator — Instrument v1.1

---

## HOW TO USE THIS DOCUMENT

This is an instrument, not a question. Run it twice — once against Claude, once against Gemini — in completely separate, fresh contexts. Neither agent should see the other's output before producing its own.

**Step 1:** Open a fresh Claude session. Paste the SYSTEM PROMPT section as the system prompt (or first message if system prompt is unavailable). Then paste the full MBO spec as the next message.

**Step 2:** Open a fresh Gemini session. Do the same. Do not share Claude's output with Gemini before Gemini produces its own.

**Step 3:** Compare outputs. Where they agree — high confidence. Where they diverge — that divergence is the most valuable output of this entire exercise. Do not resolve divergence by picking one answer. Understand why they diverged first.

**Step 4:** If divergence is significant on any axis, run a tiebreaker: give both outputs to a third fresh session and ask it to adjudicate — not blend, adjudicate. Explain which position is better supported by the spec and why.

---

## SYSTEM PROMPT
*(paste this as system prompt or first message)*

You are a senior software architect performing an adversarial pre-build analysis of a software specification. Your job is not to build anything and not to validate anything. Your job is to find every reason the described system will not work — and where something won't work, propose a better solution.

You have no prior knowledge of this project. You have not seen any other analysis of this specification. You are reasoning from first principles using only the document provided.

**Your default posture is skepticism.** Every described process, procedure, architectural decision, and sequencing assumption in the spec is a hypothesis to be falsified — not a plan to be executed. The spec was written by people who believe it will work. Your job is to find out where they are wrong before a single line of code is written.

This means:
- Do not accept any process or procedure at face value. Ask: what are the failure modes? What does this break under real conditions? What did the author assume that may not be true?
- Do not accept any sequencing as given. The milestone ordering in the spec is a proposal. Treat it as one opinion, not ground truth.
- Do not fill gaps with optimism. Where the spec is silent or ambiguous, treat the silence as a potential failure point.
- When you find something that won't work — or won't work as described — do not just flag it. Propose a better solution and explain why it is better.

Do not optimize for a neat answer. Optimize for an accurate and adversarial one. The most valuable output of this analysis is the list of things the spec got wrong.

---

## ANALYSIS PROMPT
*(paste this immediately after the spec document)*

You have just read the Mirror Box Orchestrator specification in full. Now perform a complete pre-build analysis across the five axes below.

Work through each axis completely before moving to the next. Do not summarize. Do not skip steps. Reasoning must be shown, not just conclusions.

---

### AXIS 1 — DEPENDENCY ORDERING

Produce a complete ordered sequence of build steps from zero to Milestone 1.0.

For each step:
- Name it
- State what it produces
- State what it requires as prerequisites (be explicit — "requires X" means X must be fully working, not just started)
- State your confidence in its placement (high / medium / low) and why

The sequence must reflect true logical dependency — not the milestone ordering in the spec, which is a proposal, not a proof. If the spec's milestone ordering is wrong or suboptimal, say so and explain why.

Pay particular attention to:
- What must exist before the Intelligence Graph can be built
- What must exist before the DID pipeline can be meaningfully tested
- What must exist before any execution touches a real codebase
- What must be true before MBO can safely work on its own codebase

---

### AXIS 2 — DECISION INVENTORY

Identify every decision that must be made before or during each build step that is not already resolved by the spec.

For each decision:
- State the decision that must be made
- State what in the spec requires it
- State what the consequences are of getting it wrong
- Classify it: BLOCKING (nothing can proceed until resolved) or CONSTRAINING (affects quality/architecture but doesn't stop progress)
- State whether it can be resolved by research, by prototyping, or only by building and observing

Do not invent decisions. Only surface decisions that are genuinely required by the spec and genuinely unresolved.

---

### AXIS 3 — OFF-THE-SHELF AUDIT

For every significant technical component required by the spec, evaluate what exists off the shelf.

For each component:
- Name the component and where the spec requires it
- Identify the best available existing solution(s)
- Assess maturity: PRODUCTION-READY / STABLE / EXPERIMENTAL / ABANDONED
- Identify the gap between what the solution provides and what the spec requires
- Classify the gap: NONE / BRIDGEABLE (small wrapper or config) / SIGNIFICANT (meaningful custom work) / UNBRIDGEABLE (must build from scratch)
- State your recommendation: USE / USE WITH WRAPPER / BUILD

Cover at minimum:
- Intelligence Graph construction (Tree-sitter Node bindings, LSP client libraries)
- Sandboxed execution (Docker-in-Docker feasibility and known constraints)
- MCP server implementation
- SQLite state management
- Process management and watchdog
- Terminal UI (Ink v5 or alternatives)
- Model provider abstraction (multi-vendor routing)
- Event store append-only log
- Git operations layer
- Static analysis and linting integration

Do not limit yourself to this list. Surface any component the spec requires that has a meaningful build-vs-buy decision.

---

### AXIS 4 — OPEN QUESTIONS THAT BLOCK

Identify every question that cannot be answered by reading the spec and cannot be resolved by one person reasoning alone — questions that require external research, prototyping, or empirical testing to answer.

For each question:
- State the question precisely
- State which part of the spec it blocks or constrains
- State what would need to happen to answer it (research spike, proof-of-concept, platform test, etc.)
- Estimate the cost of getting it wrong (LOW / MEDIUM / HIGH / CATASTROPHIC)
- State whether it should be resolved before writing any code, or whether it can be deferred to a specific milestone

The spec itself flags some open questions explicitly (e.g., Docker-in-Docker feasibility, CLI auth session mounting). Surface those and any others the spec implies but does not name.

---

### AXIS 5 — RATIONALE CHAIN

For the three most consequential sequencing decisions in your Axis 1 ordering, write the full rationale chain.

A rationale chain is not a summary. It is a step-by-step logical argument: "X must precede Y because Z depends on X, and Z is required before Y can be meaningfully tested, and if Y is built before Z exists then..."

The three decisions to justify:
1. Whatever you placed as the true first step (the thing nothing else can precede)
2. Whatever you placed as the gate between pre-build work and first code
3. Whatever you placed as the gate before MBO can safely work on its own codebase

If your rationale chain for any of these reveals a dependency you did not surface in Axis 1, go back and update Axis 1 before continuing.

---

### AXIS 6 — ADVERSARIAL PROCESS AUDIT

This axis is different from the others. Do not analyze components or sequencing here. Analyze the procedures and processes described in the spec — specifically Appendices A, B, and C, and Sections 5, 8, 14, and 15 — as if you are trying to break them.

For every described process or procedure, apply this four-step attack:

**Step 1 — State the assumed precondition.** What does the spec assume must be true for this process to work? State it explicitly even if the spec doesn't name it.

**Step 2 — Attack the precondition.** Under what real-world conditions does that precondition fail? Be specific. "The internet might be slow" is not specific. "Claude CLI auth sessions expire and the spec provides no re-authentication flow during a mid-pipeline run" is specific.

**Step 3 — Find the cascade.** If this precondition fails during a real task, what breaks downstream? Trace the failure as far as it goes.

**Step 4 — Propose a better solution.** Not a patch. A better design. If the described process is fundamentally fragile, say so and describe what a robust version looks like.

Apply this to every process in the spec. Cover at minimum:

- **The DID context isolation mechanism.** The spec says `ReviewerInput` type does not contain planner output fields and that passing planner output to the reviewer before Stage 4C is "a type error." Is a TypeScript type boundary actually sufficient to enforce adversarial independence at runtime? What are the real-world ways this fails?

- **The human approval gate.** The spec says nothing executes without a human typing `go`. Under what real conditions does this guarantee degrade or become meaningless in practice?

- **The Appendix C development protocol.** The spec describes Claude Code proposing and Gemini reviewing blind. What breaks under real development conditions — context limits, session state, model refusals, output inconsistency across sessions?

- **The Intelligence Graph as a routing mechanism.** The spec uses graph blast radius to determine pipeline tier. What happens when the graph is wrong, stale, or incomplete? How does the system behave when it misclassifies a Tier 3 task as Tier 0 because the graph missed a dependency?

- **The onboarding prime directive synthesis.** The spec says the system synthesizes a prime directive that may differ from the user's Q3 answer. What are the failure modes of LLM-synthesized constraints being used as load-bearing system behavior across every subsequent task?

- **The sandbox as a pre-approval validation layer.** The spec says humans approve results they can interact with, not diffs. What conditions cause the sandbox to give a false pass — where sandbox behavior diverges from production behavior in ways the human cannot detect?

- **The self-referential development transition.** Appendix A describes MBO eventually developing itself. What are the specific conditions under which this creates a feedback loop that degrades rather than improves the system? What does a safe transition actually require that the spec doesn't specify?

For each process: if you find it sound, say so and explain why. If you find it fragile, propose the better design. Do not hedge. Do not say "this might be a concern." Say what breaks, when it breaks, and what to build instead.

---

## OUTPUT FORMAT

Structure your output with clear section headers matching all six axes. Within each axis, use numbered lists for ordered items and labeled blocks for each component or process analysis.

Do not use prose summaries between axes. Do not add an executive summary. The output of this analysis will be compared directly against an independent analysis produced by a different model — formatting consistency matters for comparison.

End your output with two sections:

**HIGHEST CONFIDENCE CONCLUSIONS** — no more than five bullet points stating the things you are most certain of regardless of any ambiguity elsewhere in the analysis. These are load-bearing facts any build plan must accommodate.

**MOST DANGEROUS SPEC ASSUMPTIONS** — no more than five bullet points identifying the assumptions in the spec that, if wrong, cause the most downstream damage. These are the things that must be validated before writing any code.

---

## AFTER BOTH OUTPUTS EXIST

When you have independent outputs from both agents, compare them using this rubric:

**Agreement check (Axis 1):** For each build step, do both agents place it in the same relative order? Flag every disagreement.

**Decision overlap (Axis 2):** Do both agents surface the same blocking decisions? Items one agent flags as BLOCKING that the other misses entirely are high-priority review items.

**Off-the-shelf divergence (Axis 3):** Where agents disagree on USE vs BUILD, that disagreement is a research spike — not a coin flip.

**Question overlap (Axis 4):** Questions both agents surface independently are confirmed blockers. Questions only one agent surfaces go to the tiebreaker.

**Rationale divergence (Axis 5):** Same conclusion via different paths increases confidence. Different conclusions means the spec has a genuine ambiguity that must be resolved before building.

**Process failure overlap (Axis 6):** Where both agents independently identify the same process as fragile, that process is broken and must be redesigned before implementation begins — not patched, redesigned. Where only one agent flags a process as fragile, that goes to the tiebreaker with the specific attack scenario as the prompt.

The goal is not consensus. The goal is to identify what is genuinely known, what is genuinely unknown, what the spec got wrong, and what must change — before a single line of code is written.