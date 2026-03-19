# TECHNICAL_DEBT.md
## Mirror Box Orchestrator — Unverified and Pending Logic

This document tracks features that have been implemented but not yet verified due to lack of local availability or environment constraints. These must be verified before Milestone 1.0.

---

### [Auth] OpenAI CLI Round-trip
- **Task**: 0.2-05
- **Status**: PENDING VERIFICATION
- **Description**: Logic for `openai chat completions create` added to `src/auth/call-model.js`.
- **Reason**: No active OpenAI CLI session/API key available for testing during Milestone 0.2.

### [Auth] Local Model (Ollama) Full Execution
- **Task**: 0.2-05
- **Status**: PENDING VERIFICATION
- **Description**: `src/auth/local-detector.js` detects the Ollama server, and `call-model.js` implements the HTTP POST to `/api/generate`.
- **Reason**: Ollama server was detected as "empty" (no models loaded) during testing. Needs a round-trip with a real model (e.g., `qwen2.5-coder`).

---

*Last updated: 2026-03-08*
