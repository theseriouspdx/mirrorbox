FULL DID IMPLEMENTATION GATE — 3-ARTIFACT RECONCILIATION REQUIRED

You are the coding agent. Do not implement anything until you complete a 3-way reconciliation.

Workspace root:
- /Users/johnserious/MBO

Primary sources (must read):
- /Users/johnserious/MBO/.dev/spec/SPEC.md  (Sections 9, 10, 11)
- /Users/johnserious/MBO/.dev/governance/AGENTS.md
- /Users/johnserious/MBO/src/auth/call-model.js
- /Users/johnserious/MBO/src/auth/model-router.js
- /Users/johnserious/MBO/src/auth/session-detector.js
- /Users/johnserious/MBO/src/auth/local-detector.js
- /Users/johnserious/MBO/src/auth/openrouter-detector.js

Audit artifacts to reconcile:
- Artifact A (initial auditor findings): /Users/johnserious/MBO/Adversarial Audit- MBO Specification Flaws (claude+Gemini).md
- Artifact B (Claude audit-of-audit): /Users/johnserious/MBO/Claude Output DID Pre-Buil.md
- Artifact C (auditor rebuttal/confirmation): use the latest reconciliation summary from this thread as the third artifact input.

Required output before coding:
1) “3-Artifact Reconciliation Matrix” with columns:
   - Finding ID
   - Artifact A
   - Artifact B
   - Artifact C
   - Final decision: IMPLEMENT / DO NOT IMPLEMENT / NEEDS SPEC CLARIFICATION
   - Evidence (SPEC/AGENTS line-cited)

2) Only after matrix completion, implement ONLY final-IMPLEMENT items.

Expected IMPLEMENT candidates (confirm via matrix):
- P0 firewall contract in callModel per SPEC §10
- HTTP timeout enforcement (local + OpenRouter request paths)
- OpenRouter key-source consistency (detector → caller)
- Role-routing alignment with SPEC §11 vendor-role intent
- Onboarding route as frontier-first behavior
- Null/empty CLI binary guard before spawnSync

Expected DO NOT IMPLEMENT candidates (unless evidence overturns):
- Replacing tiebreaker with Local > CLI > OpenRouter
- Removing variable error body details if blocked by AGENTS Strict Mode

Post-implementation required:
- File-by-file diff summary
- Verification evidence (focused tests/checks for auth/routing paths)
- Residual risks + any remaining spec ambiguities
