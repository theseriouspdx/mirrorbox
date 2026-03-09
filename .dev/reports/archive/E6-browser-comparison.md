# E6 Browser Comparison — Live Observations
## Recorded during experiment session 2026-03-09

---

## Conditions

Both browser sessions were Gemini. Claude CLI was run separately with MCP tools live.

| Session | Method | Model | Files attached | Context |
|---------|--------|-------|---------------|---------|
| Browser Tab 1 | Browser + full files | Gemini | SPEC.md + call-model.js + operator.js + model-router.js + db-manager.js | Full load |
| Browser Tab 2 | Browser + graph context injected | Gemini | None | Graph output block only |
| CLI | Graph-driven via MCP tools | Claude | None — MCP tools available | Autonomous graph queries |

Task given to all: Milestone 0.6, Task 0.6-02 — Wire the classifier in callModel to a real provider.

---

## Browser Tab 1 — Gemini Full Load

**Token count:** ~24,500 tokens  
**Behavior:** Proceeded directly to implementation plan. No clarifying questions.  
**Plan quality:** 4-step concrete plan covering model-router verification, operator.js refinement, call-model.js validation, and execution order with a verification step against mirrorbox.db.  
**Notable:** Plan independently identified the same issues surfaced in the Claude/Gemini audit (placeholder removal, JSON validation, heuristic as fail-safe).

---

## Browser Tab 2 — Gemini Graph Context Injected

**Token count:** TBD (not yet reported)  
**Behavior:** Asked 3 clarifying questions before producing any plan:
  1. Does callModel handle Section 10 tag format enforcement internally, or does the redactor pre-process before classification?
  2. Should the classifier return a tier assignment directly, or a latent intent classification that the operator maps to a tier?
  3. How should the classifier handle context window overflow — truncate before classification or trigger Section 19 error code?

**Notable:** Model did NOT proceed to planning. It surfaced ambiguity first.

---

## Key Observation — Behavioral Divergence

This is more significant than the token count difference.

**Full-load model:** Had enough context to make assumptions and proceed. Produced a plan immediately.

**Graph-context model:** Hit genuine ambiguities in the graph output and surfaced them as questions rather than assuming through them.

The three questions Tab 2 asked are legitimate spec ambiguities — none of them have a single obvious answer from reading Section 8 and 10 alone. The full-load model resolved them silently (by assumption). The graph-context model exposed them.

**For DID pipeline design this is load-bearing:**
- Full-load planners will make silent assumptions about ambiguous spec sections
- Graph-context planners will surface those ambiguities as questions
- Surfacing ambiguity before planning is the correct behavior for a system where divergence between planners is the quality signal
- The graph-context model's behavior aligns with the DID philosophy: disagreement and ambiguity surfaced early is cheaper than divergence discovered at Gate 1

**The implication:** Graph-driven context loading may not just be cheaper — it may produce *better* planner behavior by forcing explicit handling of ambiguity rather than silent resolution.

---

## Open Questions From This Observation

1. Are the three questions Tab 2 asked actually answered in the spec, and the model just didn't have the relevant sections? Or are they genuine spec gaps?
   - If answered in spec → graph context block needs to include more sections (query was too narrow)
   - If genuine gaps → these should be filed as spec bugs before 0.6-02 implementation

2. Would Tab 2 have asked the same questions if given a slightly broader graph query result (e.g., including Section 13 formal input contracts)?

3. Is the clarifying-question behavior a consistent property of graph-context loading, or specific to this task's ambiguity level?

---

## Answers to Tab 2 Questions (for reference)

**Q1 — Tag format enforcement:** Section 10 is explicit — callModel wraps all context in PROJECT_DATA tags and prepends the firewall directive. The redactor handles secret removal from payloads. These are separate concerns. callModel owns the firewall; redactor owns secret scrubbing.

**Q2 — Classifier output schema:** Section 13 is explicit — classifier outputs a Classification object with route, risk, complexity, files, rationale, confidence. The operator maps this to a tier via determineRouting(). The classifier does NOT output a tier directly.

**Q3 — Context window overflow:** Section 8 is explicit — context management is the operator's responsibility via checkContextLifecycle(), not the classifier's. The classifier receives a prompt; if the operator's context is overflowing, summarization happens before the classifier is invoked.

**Verdict:** All three questions are answered in the spec. The graph context block provided to Tab 2 was too narrow — it included Section 8 routing tiers but not Section 13 formal input contracts or the full Section 10 enforcement details. The model correctly identified that it lacked the information to proceed.

This is not a failure of graph-driven loading. It is a calibration problem: the graph query needs to be broader for architectural tasks than for single-file tasks.

---

---

## Tab 2 — Follow-up (After Answers Provided)

Answers to the three clarifying questions were provided. Model confirmed it had integrated the context and asked: "Would you like me to generate the refined operator.js and call-model.js files?"

**Status:** Redirected. Told not to generate files — measurement session only.

---

## Gemini Browser Result (E6-A replication)

**Token count:** ~26,300 tokens  
**Tools called:** None  
**Behavior:** Processed files as "shared mental context." Produced implementation plan unprompted. Asked to generate files immediately.  
**Notable:** Claimed to integrate "E6 report logic into HardState" — incorrect use of the term. HardState is immutable session context set at initialization, not updated mid-session by chat input. Flagged as a hallucination of architectural terminology.

---

## Three-Way Summary (current state)

| Condition | Model | Token count | Tools called | Behavior |
|-----------|-------|-------------|--------------|----------|
| Browser + full files | Gemini | ~24,500 | None | Proceeded directly to plan |
| Browser + graph context injected | Gemini | ~26,300 | None (no MCP) | Asked 3 clarifying questions |
| CLI + graph (MCP live) | Claude | ~2,100 | 11 (8 graph, 3 reads) | Autonomous — no instruction needed |
| CLI + graph | Gemini | TBD — awaiting E2 run | TBD | Pending |

---

## Emerging Finding — Same Model, Different Context, Different Behavior

Both browser sessions were the same model (Gemini). The only variable was context loading strategy. Full-load Gemini proceeded immediately. Graph-context Gemini asked three clarifying questions. This eliminates model variance as an explanation — the behavior difference is caused entirely by context loading strategy.

*CLI results to be added when Claude E1/E2 run completes.*
