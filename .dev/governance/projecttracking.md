# projecttracking.md
## Mirror Box Orchestrator — Canonical Task Ledger

**Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]
**Next Task:** v0.11.162
**Policy:** This file is the single source of truth for work state.

---

## Active Tasks
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.152 | bug | BUG-152 MCP daemon start in setup flow | READY | unassigned | - | 2026-03-19 | BUG-152 | `mbo setup` reliably starts daemon for fresh projects |
| v0.11.153 | bug | BUG-153 State Manager `data/` directory init | READY | unassigned | - | 2026-03-19 | BUG-153 | Fresh projects create `data/` via `initProject` |
| v0.11.154 | bug | BUG-154 Controller drift false-positive warning | READY | unassigned | - | 2026-03-19 | BUG-154 | Warning only triggers in source controller repo |
| v0.11.155 | bug | BUG-155 TM dashboard costing drift | READY | unassigned | - | 2026-03-19 | BUG-155 | TM dashboard reflects accurate savings |
| v0.11.156 | bug | BUG-156 Spec refinement gate on read-only | READY | unassigned | - | 2026-03-19 | BUG-156 | Read-only queries bypass spec refinement gate |
| v0.11.157 | bug | BUG-157 Operator empty response failure | READY | unassigned | - | 2026-03-19 | BUG-157 | Operator always returns answer or clarifying question |
| v0.11.158 | bug | BUG-158 WORLD context drift | READY | unassigned | - | 2026-03-19 | BUG-158 | WORLD value stable across pinning loop |
| v0.11.159 | bug | BUG-159 Ledger generation failure | READY | unassigned | - | 2026-03-19 | BUG-159 | Ledger generates successfully on all runs |
| v0.11.160 | bug | BUG-160 Hint injection label mangling | READY | unassigned | - | 2026-03-19 | BUG-160 | Hint labels echo correctly in prompts |
| v0.11.161 | bug | BUG-161 context_pinning convergence delay | READY | unassigned | - | 2026-03-19 | BUG-161 | Low-complexity loops converge in < 2 passes |
| v0.11.162 | bug | BUG-162 FILES prompt empty validation | READY | unassigned | - | 2026-03-19 | BUG-162 | FILES prompt validates non-empty where required |
| v0.11.86 | bug | BUG-086 root-mismatch re-onboarding validation round 2 | COMPLETED | gemini | gemini/bug-086-revalidate | 2026-03-19 | BUG-086 | Fresh install re-onboards when copied profile has missing/foreign `projectRoot` |
| v0.11.36 | docs | Workflow canonicalization and validator enforcement | IN_PROGRESS | codex | codex/e2e-20260318-212502 | 2026-03-19 | BUG-152..162 | Alpha E2E run in progress; P0 blockers identified |

---

## Recently Completed
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.86 | bug | BUG-086 root-mismatch re-onboarding validation round 2 | COMPLETED | gemini | gemini/bug-086-revalidate | 2026-03-19 | BUG-086 | Fixed legacy profile drift and missing root check |
| v0.11.96 | docs | Deprecate NEXT_SESSION governance path | COMPLETED | codex | - | 2026-03-19 | BUG-141 | NEXT_SESSION removed from required protocol |
