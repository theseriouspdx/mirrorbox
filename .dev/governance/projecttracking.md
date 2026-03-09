# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** PRE-0.1 — Spec Correction
**Next Action:** PRE-0.1-01 (see below)

---

## NEXT ACTION

**PRE-0.1-01** — Correct BUG-001 and BUG-002 in SPEC.md (milestone reordering in Appendix A)
- Prereqs: SPEC.md exists at .dev/spec/SPEC.md ✅
- Produces: Corrected Appendix A milestone sequence
- Blocks: Nothing until all PRE-0.1 tasks done

---

## CORRECTED MILESTONE SEQUENCE

Derived from DID pre-build analysis. Replaces Appendix A ordering in spec.

| Milestone | Name | Key dependency |
|-----------|------|----------------|
| PRE-0.1 | Spec Correction | All P0/P1 bugs fixed before code |
| 0.1 | Environment | Repo, Docker, Gate 0 checks |
| 0.2 | Auth + Model Routing | CLI detection, OpenRouter, local models |
| 0.3 | State + Event Foundation | SQLite schema, Event Store, mirrorbox.db |
| 0.4 | Intelligence Graph | Tree-sitter + LSP, MCP server, graph queries |
| 0.5 | callModel + Firewall | All model calls through one function, XML firewall |
| 0.6 | Operator + Session | Classification, routing, context management — depends on 0.4 |
| 0.7 | DID Pipeline (no execution) | Stages 1–5, all gates, tiebreaker, human approval |
| 0.8 | Sandbox | Docker-in-Docker, runtime observation, pre-flight dry run |
| 0.9 | Execution + Git | Patch generation, merge, verification — sandbox must precede this |
| 0.10 | Onboarding | Interview, prime directive, profile — pipeline must exist to consume it |
| 0.11 | VS Code Extension | Same event protocol, different renderer |
| 1.0 | Self-Referential | First task on own codebase. External invariant suite passes. |

---

## PRE-0.1 — Spec Correction Tasks

| ID | Task | Status |
|----|------|--------|
| PRE-0.1-01 | Fix BUG-001 + BUG-002: Correct milestone ordering in SPEC.md Appendix A | COMPLETED |
| PRE-0.1-02 | Fix BUG-003: Document runtime DID enforcement requirement in Section 14 + Section 22 | COMPLETED |
| PRE-0.1-03 | Fix BUG-004: Add Tier 0 safelist requirement to Section 8 | COMPLETED |
| PRE-0.1-04 | Fix BUG-005: Rename adversarial review accurately in Appendix C | COMPLETED |
| PRE-0.1-05 | Fix BUG-006: Replace prime directive "do you agree?" with paraphrase-back in Section 5 | COMPLETED |
| PRE-0.1-06 | Fix BUG-007: Define sandbox execution modes in Section 16 | COMPLETED |
| PRE-0.1-07 | Fix BUG-008: Add external invariant test suite requirement to Milestone 1.0 | COMPLETED |
| PRE-0.1-08 | Review SPEC.md for P2 bugs and add spec notes where needed | COMPLETED |
| PRE-0.1-09 | Verify directory structure matches namespace design | COMPLETED |

---

## MILESTONE 0.1 — Environment

| ID | Task | Status |
|----|------|--------|
| 0.1-01 | Initialize git repo with .gitignore | COMPLETED |
| 0.1-02 | Write AGENTS.md for .dev/ development process (governs Phase 1 human builders) | COMPLETED |
| 0.1-02a | Write AGENTS.md for src/ codebase (governs MBO's own agents at 1.0) | NOT STARTED |
| 0.1-03 | Docker container builds and runs | NOT STARTED |
| 0.1-04 | Gate 0 checks pass: Mac, Linux, WSL2 | NOT STARTED |
| 0.1-05 | Dummy task through development protocol end-to-end | NOT STARTED |

**Note on 0.1-02 vs 0.1-02a:** Two separate AGENTS.md files, two purposes.
- `.dev/governance/AGENTS.md` — governs Phase 1 human developers building MBO (exists now, will be refined at 0.1-02)
- `AGENTS.md` at project root or `src/AGENTS.md` — governs MBO's own agents when it works on itself at Milestone 1.0 (written at 0.1-02a, used at 1.0)

The session start protocol reads AGENTS.md first. That file must exist and be current before any session begins.

---

## COMPLETED

- **PRE-0.1-01** to **PRE-0.1-09**: Complete spec correction and validation. Milestone PRE-0.1 finished.
- **0.1-01**: Initialize git repo with .gitignore.


---

*Last updated: 2026-03-08*
