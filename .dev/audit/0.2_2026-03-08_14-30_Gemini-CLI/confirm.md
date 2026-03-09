**Phase 1 Foundation Audit**

1. **[P0] `callModel` violates the Section 10 firewall contract**
- Spec requires `callModel(role, prompt, context)` to wrap context in `<PROJECT_DATA>`, prepend firewall directive, and validate boundaries.
- Current implementation only accepts `(role, prompt)` and directly dispatches providers with no firewall enforcement.
- Reference: [call-model.js](/Users/johnserious/MBO/src/auth/call-model.js#L12), [SPEC.md](/Users/johnserious/MBO/.dev/spec/SPEC.md#L711)

2. **[P1] Timeout handling is incomplete; calls can stall**
- `http.request` / `https.request` set `timeout`, but neither `callLocalProvider` nor `callOpenRouter` attaches `req.on('timeout', ...)` to destroy/reject.
- This can leave unresolved promises under network stalls.
- Reference: [call-model.js](/Users/johnserious/MBO/src/auth/call-model.js#L59), [call-model.js](/Users/johnserious/MBO/src/auth/call-model.js#L100)

3. **[P1] OpenRouter detection and usage are inconsistent**
- `detectOpenRouter()` accepts key from env **or** `~/.orchestrator/config.json`, but `callOpenRouter()` always uses `process.env.OPENROUTER_API_KEY`.
- If key exists only in config, routing marks OpenRouter usable, but runtime call sends `Bearer undefined`.
- Reference: [openrouter-detector.js](/Users/johnserious/MBO/src/auth/openrouter-detector.js#L42), [call-model.js](/Users/johnserious/MBO/src/auth/call-model.js#L113)

4. **[P1] Role routing does not align with Section 11 defaults**
- `findProvider()` always prefers local when Ollama is present, including planners/reviewer/onboarding.
- Section 11 defines default vendor roles (Claude planners, Gemini reviewer, frontier onboarding/tiebreaker). Current behavior collapses most roles to local.
- Reference: [model-router.js](/Users/johnserious/MBO/src/auth/model-router.js#L27), [SPEC.md](/Users/johnserious/MBO/.dev/spec/SPEC.md#L733)

5. **[P1] “Local > CLI > OpenRouter for all roles” is not true for `tiebreaker`**
- Tiebreaker is currently `OpenRouter > Claude CLI > Local`.
- This may be intentional per “best available frontier,” but it is not Section 9 priority and should be explicitly codified as an exception.
- Reference: [model-router.js](/Users/johnserious/MBO/src/auth/model-router.js#L44), [SPEC.md](/Users/johnserious/MBO/.dev/spec/SPEC.md#L680)

**Verification of prior findings**

- **Null binary crash (Gemini route):** not fully hardened. Current detector usually sets binary with auth, but `callCliProvider` still has no defensive `config.binary` validation before `spawnSync`.
- **Missing timeout:** **not fixed** (see finding #2).
- **Poor JSON escaping:** largely improved for OpenAI CLI path via `JSON.stringify` payload.
- **Spec priority violations:** **not fixed** (see findings #4 and #5).

**Security scan (`OPENROUTER_API_KEY`)**

- No obvious direct key logging found.
- Risk remains from passing raw upstream `body` into thrown errors, which may leak provider internals into logs/transcripts.
- Reference: [call-model.js](/Users/johnserious/MBO/src/auth/call-model.js#L127)

**System integrity (hang/crash edge cases)**

- Main residual risk is unresolved network timeout behavior.
- Secondary risk is runtime auth mismatch (`Bearer undefined`) causing hard failure on OpenRouter path.

1. Implement Section 10 firewall behavior in `callModel` before Milestone 0.3.
2. Add explicit timeout rejection/destroy handlers in both HTTP providers.
3. Unify OpenRouter key sourcing (detector + caller) and enforce non-empty bearer token.