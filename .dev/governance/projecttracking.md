# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** 1.0 — Production Alpha [IN PROGRESS]
**Next Action:** 1.0-03 — The Relay (Cross-World Telemetry) — SPEC authoring required first

---

## NEXT ACTION

**Task 1.0-03 — The Relay (Cross-World Telemetry)**
Prerequisite: Author SPEC Section 24 (Cross-World Event Streaming) before implementation.

---

## MILESTONE 0.8 — Sandbox [COMPLETED]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 0.8-01 | Create Docker-in-Docker sandbox container | COMPLETED |
| 0.8-02 | Implement sandbox spawn/teardown logic | COMPLETED |
| 0.8-03 | Implement pre/post patch comparison logic | COMPLETED |
| 0.8-04 | Implement regression detection loop | COMPLETED |
| 0.8-05 | Implement runtime trace collection | COMPLETED |
| 0.8-06 | Implement runtime edge update logic | COMPLETED |
| 0.8-07 | Implement Runtime Edge enrichment for Intelligence Graph | COMPLETED |
| 0.8-08 | Implement BUG-013: CLI sandbox interaction (focus ctrl+f) | COMPLETED |

---

## MILESTONE 0.9 — Sovereign Factory [COMPLETED]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 0.9.1 | Implement bin/handshake.py & bin/validator.py | COMPLETED |
| 0.9.2 | Constitutional Sync & Day Zero Baseline | COMPLETED |

---

## MILESTONE 1.0 — Production Alpha [IN PROGRESS]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 1.0-01 | Global Integrity & Bug-Fix Patch (BUG-009, BUG-037) | COMPLETED |
| 1.0-02 | Initialize Subject World (Target Codebase) logic | COMPLETED |
| 1.0-03 | The Relay — UDS cross-world telemetry (Subject → Mirror EventStore) | COMPLETED |
| 1.0-04 | The Pile — Promotion engine (Mirror → Subject, Merkle-validated) | COMPLETED |
| 1.0-05 | The Guard — Relay integrity gatekeeper (scope + chain validation) | COMPLETED |
| 1.0-06 | Stage 6/7/8 wiring — handshake.py writes, validator.py, test runner | COMPLETED |
| 1.0-07 | Subject World graph routing — Stage 2 routes by world_id to correct DB | OPEN |
| 1.0-08 | External Invariant Test Suite — black-box, all Section 22 invariants | OPEN |
| 1.0-09 | Sovereign Loop — MBO patches itself end-to-end (1.0 close condition) | OPEN |
| 1.0-MCP-01 | MCP Layer 1: Fix signal trap stderr redirect + close fd 3 (BUG-049) | COMPLETED |
| 1.0-MCP-02 | MCP Layer 2: EPIPE guard in mcp-server.js | COMPLETED |
| 1.0-MCP-03 | MCP Layer 3: Startup sentinel file (.dev/run/mcp.ready) | COMPLETED |
| 1.0-MCP-04 | MCP Layer 4: launchd plist (com.mbo.mcp) | COMPLETED |
| 1.0-MCP-05 | MCP Layer 5: Transparent session recovery on stale session-id | COMPLETED |
