# projecttracking.md
## Mirror Box Orchestrator — Canonical Task Ledger

**Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]
**Next Task:** v0.11.86
**Policy:** This file is the single source of truth for work state.

---

## Active Tasks
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.86 | bug | BUG-086 root-mismatch re-onboarding validation round 2 | IN_PROGRESS | gemini | gemini/bug-086-revalidate | 2026-03-17 | BUG-086,BUG-119,BUG-120,BUG-121,BUG-122,BUG-123,BUG-124 | Fresh install re-onboards when copied profile has missing/foreign `projectRoot`; evidence logged in BUGS.md |
| v0.11.61 | bug | BUG-061 Merkle scope + MCP query path drift closure | READY | gemini | gemini/bug-061-closure | 2026-03-17 | BUG-061 | Merkle scope contract implemented + non-src drift tests + standardized `node scripts/mcp_query.js` path |
| v0.11.52 | bug | BUG-052 global mbo CLI entrypoint packaging | READY | codex | codex/bug-052-cli-entrypoint | 2026-03-17 | BUG-052 | `mbo` installable globally and validated in clean environment |
| v0.11.36 | docs | Workflow canonicalization and validator enforcement | IN_PROGRESS | codex | codex/workflow-canonicalization | 2026-03-17 | BUG-048 | AGENTS/protocol updated, session-close generator deterministic, validator drift checks enforced |

---

## Recently Completed
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.22 | feature | Adaptive Onboarding v2 Intelligence Layer (UX-022..UX-028) | COMPLETED | codex | codex/onboarding-v2-ux-elevation | 2026-03-17 | BUG-093,BUG-094,BUG-095,BUG-096,BUG-097,BUG-098,BUG-099,BUG-100,BUG-101 | Merged to master and `scripts/test-onboarding.js` 8/8 pass |
| v0.10.09 | feature | Sovereign Loop (Self-Patching Validation) | COMPLETED | gemini | gemini/onboarding-v2 | 2026-03-16 | 1.0-09 | Verification gate pass recorded |

---

## Backlog
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.63 | bug | Harden macOS auth fallback explicit user-presence prompt | BACKLOG | unassigned | - | 2026-03-17 | BUG-063 | Deterministic user-presence prompt semantics validated |

---

## Status Vocabulary
- `BACKLOG`: defined but not scheduled
- `READY`: approved and ready to execute
- `IN_PROGRESS`: currently being implemented
- `BLOCKED`: cannot proceed; blocker must be explicit in `Links`
- `COMPLETED`: accepted with evidence in `Acceptance`
