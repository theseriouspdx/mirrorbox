# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** PRE-0.4 — Spec Corrections [IN PROGRESS]
**Next Action:** PRE-0.4-02 — MCP server research spike

---

## NEXT ACTION

**PRE-0.4-02** — MCP server research spike: evaluate @modelcontextprotocol/sdk vs alternatives; document in SPEC.md Section 6
- Status: OPEN

---

## CORRECTED MILESTONE SEQUENCE

| Milestone | Name | Key dependency |
|-----------|------|----------------|
| PRE-0.1 | Spec Correction | All P0/P1 bugs fixed before code |
| 0.1 | Environment | Repo, Docker, Gate 0 checks |
| 0.2 | Auth + Model Routing | CLI detection, OpenRouter, local models |
| 0.3 | State + Event Foundation | SQLite schema, Event Store, mirrorbox.db |
| PRE-0.4 | Spec Correction | Off-the-shelf audit diff + open decisions before 0.4 code |
| 0.4A | Intelligence Graph (Skeleton) | Tree-sitter integration, static nodes/edges |
| 0.4B | Intelligence Graph (Enrichment) | LSP integration, cross-file calls, MCP tools |
| 0.5 | callModel + Firewall | All model calls through one function, XML firewall |
| 0.6 | Operator + Session | Classification, routing, context management |
| 0.7 | DID Pipeline (no execution) | Stages 1–5, all gates, tiebreaker, human approval |
| 0.8 | Sandbox | Docker-in-Docker, runtime observation, pre-flight dry run |
| 0.9 | Execution + Git | Patch generation, merge, verification |
| 0.10 | Onboarding | Interview, prime directive, profile |
| 0.11 | VS Code Extension | Same event protocol, different renderer |
| 1.0 | Self-Referential | First task on own codebase. External invariant suite passes. |

---

## MILESTONE 0.3 — State + Event Foundation [SUCCESS]

**Audit result:** PASS (2026-03-08, Gemini CLI)
**Audit report:** `.dev/audit/0.3_080326.2137_Claude-Code/AUDIT_REPORT.md` (Updated by Gemini CLI session 11)
**Resolved:** BUG-023 (P0 — redactor fixed, key rotated, DB rebuilt clean), BUG-024 (chain hash with prev_hash chaining ✅), BUG-025 (seq in tx ✅), BUG-026 (snapshot guard ✅), Immutable Chaining (Task 1 & 2 ✅)

| ID | Task | Status |
|----|------|--------|
| 0.3-01 | SQLite schema + Event Store implementation | COMPLETED |
| 0.3-02 | Remaining 0.3 implementation tasks | COMPLETED |
| 0.3-BF-01 | Rotate leaked OpenRouter key (operational) | COMPLETED |
| 0.3-BF-02 | Fix BUG-023: Redactor callback offset/group1 confusion | COMPLETED |
| 0.3-BF-03 | Fix BUG-024: Chain-linked hash envelope + seq field | COMPLETED |
| 0.3-BF-04 | Fix BUG-025: id/timestamp/seq inside transaction | COMPLETED |
| 0.3-BF-05 | Fix BUG-026: Snapshot type guard on recover() | COMPLETED |
| 0.3-BF-06 | Rebuild mirrorbox.db clean | COMPLETED |
| 0.3-RE-AUDIT | Full re-audit of entire Milestone 0.3 | COMPLETED |

---

## PRE-0.4 — Spec Corrections (after 0.3 closes)

| ID | Task | Status |
|----|------|--------|
| PRE-0.4-01 | Apply off-the-shelf audit diff to SPEC.md (0.4A/0.4B split, seq field, redaction note, callModel schema validation note) | COMPLETED |
| PRE-0.4-02 | MCP server research spike: evaluate @modelcontextprotocol/sdk vs alternatives; document in SPEC.md Section 6 | COMPLETED |

---

## PRE-0.1 — Spec Correction Tasks ✅ COMPLETED

| ID | Task | Status |
|----|------|--------|
| PRE-0.1-01 | Fix BUG-001 + BUG-002: Correct milestone ordering in SPEC.md Appendix A | COMPLETED |
| PRE-0.1-02 | Fix BUG-003: Runtime DID enforcement in Section 14 + Section 22 | COMPLETED |
| PRE-0.1-03 | Fix BUG-004: Tier 0 safelist requirement in Section 8 | COMPLETED |
| PRE-0.1-04 | Fix BUG-005: Rename adversarial review in Appendix C | COMPLETED |
| PRE-0.1-05 | Fix BUG-006: Paraphrase-back validation in Section 5 | COMPLETED |
| PRE-0.1-06 | Fix BUG-007: Sandbox execution modes in Section 16 | COMPLETED |
| PRE-0.1-07 | Fix BUG-008: External invariant test suite in Milestone 1.0 | COMPLETED |
| PRE-0.1-08 | Review SPEC.md for P2 bugs | COMPLETED |
| PRE-0.1-09 | Verify directory structure | COMPLETED |

---

## MILESTONE 0.1 — Environment ✅ COMPLETED

| ID | Task | Status |
|----|------|--------|
| 0.1-01 | Initialize git repo with .gitignore | COMPLETED |
| 0.1-02 | Write AGENTS.md for .dev/ development process | COMPLETED |
| 0.1-02a | Write AGENTS.md for src/ codebase (governs MBO agents at 1.0) | COMPLETED |
| 0.1-03 | Docker container builds and runs | COMPLETED |
| 0.1-04 | Gate 0 checks pass: Mac, Linux, WSL2 | COMPLETED |
| 0.1-05 | Dummy task through development protocol end-to-end | COMPLETED |

---

## MILESTONE 0.2 — Auth + Model Routing ✅ COMPLETED

| ID | Task | Status |
|----|------|--------|
| 0.2-01 | CLI session detection (Claude, Gemini, OpenAI) | COMPLETED |
| 0.2-02 | Local model detection (Ollama, LM Studio) | COMPLETED |
| 0.2-03 | OpenRouter fallback operational | COMPLETED |
| 0.2-04 | Model routing config loads and routes correctly | COMPLETED |
| 0.2-05 | All providers complete a simple prompt round-trip | COMPLETED |
| BUG-019 | Implement Section 10 firewall in callModel | COMPLETED |
| BUG-020 | Add timeout handlers in HTTP providers | COMPLETED |
| BUG-021 | Unify OpenRouter key sourcing | COMPLETED |
| BUG-022 | Align role routing with Section 11 | COMPLETED |

---

## COMPLETED MILESTONES

- **Milestone 0.2**: Auth + Model Routing.
- **Milestone 0.1**: Environment foundation.
- **Milestone PRE-0.1**: Spec correction and validation.

---

*Last updated: 2026-03-08*
