# CHANGELOG.md
## Mirror Box Orchestrator — Project Evolution

---

### [0.2.0] — 2026-03-08
#### Added
- **0.2-05**: Unified `callModel` function with multi-provider round-trips.
  - Implemented `src/auth/call-model.js` supporting CLI (Claude, Gemini, OpenAI), Local (Ollama), and OpenRouter.
  - Verified round-trips with Gemini CLI and OpenRouter.
  - Added `.dev/governance/TECHNICAL_DEBT.md` for OpenAI/Ollama pending verification.
- **0.2-04**: Model routing logic implementation.
  - Implemented `src/auth/model-router.js` with priority-based role mapping.
  - Priority established: Local > CLI Session > OpenRouter.
  - Verified deterministic mapping for all specification roles (Classifier, Planner, Reviewer, etc.).
- **0.2-03**: OpenRouter fallback operational.
  - Implemented `src/auth/openrouter-detector.js` prioritizing `OPENROUTER_API_KEY` environment variable.
  - Verified authentication and connectivity to OpenRouter API.
- **0.2-02**: Local model detection (Ollama, LM Studio).
  - Implemented `src/auth/local-detector.js` using HTTP health checks.
  - Verified detection of `Ollama` in Darwin environment.
- **0.2-01**: CLI session detection for Claude, Gemini, and OpenAI.
  - Implemented `src/auth/session-detector.js`.
  - Verified detection of `Claude Code` and `Gemini CLI` sessions in Darwin environment.
  - Soft auth checks for configuration and environment variables.

### [0.1.0] — 2026-03-08
#### Environment Foundation
- Initialized repository with governance documents (`AGENTS.md`, `SPEC.md`, `BUGS.md`, `projecttracking.md`).
- Established `Dual Independent Derivation (DID)` protocol.
- Verified Docker build environment.
- Verified cross-platform Gate 0 requirements.

---

*Last updated: 2026-03-08*
