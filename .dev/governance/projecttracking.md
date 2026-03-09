# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** 0.7 — DID Pipeline (no execution) [IN PROGRESS]
**Next Action:** 0.7-03 — operator.js: Implement Stage 4 code derivation and consensus gate

---

## NEXT ACTION

**0.7-03** — operator.js: Implement Stage 4 code derivation and consensus gate
- Define `ReviewerOutput` schema for Stage 4.
- Implement `runStage4()` to orchestrate Planner and Reviewer (blind).
- Implement qualitative code consensus logic.
- Status: OPEN

---

## CORRECTED MILESTONE SEQUENCE

| Milestone | Name | Key dependency | Status |
|-----------|------|----------------|--------|
| PRE-0.1 | Spec Correction | All P0/P1 bugs fixed before code | SUCCESS |
| 0.1 | Environment | Repo, Docker, Gate 0 checks | SUCCESS |
| 0.2 | Auth + Model Routing | CLI detection, OpenRouter, local models | SUCCESS |
| 0.3 | State + Event Foundation | SQLite schema, Event Store, mirrorbox.db | SUCCESS |
| PRE-0.4 | Spec Correction | Audit diff + open decisions | SUCCESS |
| 0.4A | Intelligence Graph (Skeleton) | Tree-sitter integration | SUCCESS |
| 0.4B | Intelligence Graph (Enrichment) | LSP integration, MCP tools | SUCCESS |
| 0.5 | callModel + Firewall | Unified callModel, XML firewall | SUCCESS |
| 0.6 | Operator + Session | Classification, routing, context management | SUCCESS |
| 0.7 | DID Pipeline (no execution) | Stages 1–5, tiebreaker | IN PROGRESS |
| 0.7.x | MCP Watchdog | BUG-044 fix — liveness probe + multi-agent PID check | OPEN |
| 0.8 | Sandbox | Docker-in-Docker, runtime observation | OPEN |
| 0.9 | Execution + Git | Patch generation, merge, verification | OPEN |
| 0.10 | Onboarding | Interview, prime directive, profile | OPEN |
| 0.11 | VS Code Extension | Wire protocol events | OPEN |
| 1.0 | Self-Referential | First task on own codebase | OPEN |

---

## MILESTONE 0.7 — DID Pipeline (no execution) [IN PROGRESS]

| ID | Task | Status |
|----|------|--------|
| 0.7-01 | SPEC.md Update: Redefine consensus as Qualitative Intent | COMPLETED |
| 0.7-02 | operator.js: Implement Stage 1.5 and Stage 3 qualitative consensus | COMPLETED |
| 0.7-03 | operator.js: Implement Stage 4 code derivation and consensus gate | OPEN |
| 0.7-04 | callModel: Implement Invariant 7 (Blind Isolation) hash scanning | OPEN |
| 0.7-05 | Implement Stage 3D/4D Tiebreaker logic | OPEN |

---

## MILESTONE 0.6 — Operator + Session ✅ SUCCESS

| ID | Task | Status |
|----|------|--------|
| 0.6-00 | Universal MCP session start (mbo-start.sh + AGENTS.md 1.5) | COMPLETED |
| 0.6-01 | Implement the Operator & Session Manager | COMPLETED |
| 0.6-02 | Classification routing based on Section 8 Tier 0-3 | COMPLETED |
| 0.6-03 | Context window lifecycle (auto-summarization) | COMPLETED |
| 0.6-BF | Fix BUG-038: JavaScript Graph Enrichment (LSP fallback) | COMPLETED |
| 0.6-04 | Session handoff persistence (NEXT_SESSION.md) | COMPLETED |

---

## MILESTONE 0.5 — callModel + Firewall ✅ SUCCESS

| ID | Task | Status |
|----|------|--------|
| 0.4A-01 | Tree-sitter integration: scan src/, extract nodes/edges | COMPLETED |
| 0.4A-02 | graph-store.js: write nodes and edges to mirrorbox.db | COMPLETED |
| 0.4A-03 | Basic query: what calls X, what does X import | COMPLETED |
| 0.4A-04 | GraphQueryResult format matches Section 13 contract | COMPLETED |
| 0.4A-05 | Fix 0.4A Audit FAIL (Item 5): event-store.js + SPEC.md | COMPLETED |
| 0.4A-06 | Fix 0.4A Audit WARN (Item 6): AGENTS.md server ref | COMPLETED |
| 0.4A-07 | AGENTS.md Section 9: Diff-only + Peer Review rules | COMPLETED |

---

## MILESTONE 0.4B — Intelligence Graph: LSP Enrichment ✅ SUCCESS
