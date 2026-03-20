# projecttracking.md
## Mirror Box Orchestrator — Canonical Task Ledger

**Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]
**Next Task:** v0.11.170
**Policy:** This file is the single source of truth for work state.

---

## Active Tasks
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.170 | bug | BUG-170 first-launch missing-config should force setup before operator prompt | READY | unassigned | - | 2026-03-19 | BUG-170 | First launch with missing required config runs setup/fail-closed; never drops user to operator prompt |
| v0.11.169 | bug | BUG-169 DID tiebreaker null-verdict silent convergence | COMPLETED | claude | - | 2026-03-19 | BUG-169 | Tiebreaker null-verdict escalates to needs_human; no convergent package emitted without finalDiff |
| v0.11.166 | bug | BUG-166 global install relay socket path EACCES crash loop | READY | unassigned | - | 2026-03-19 | BUG-166 | Global install resolves relay socket under runtime root and launches cleanly |
| v0.11.167 | bug | BUG-167 non-TTY onboarding failure respawn loop | READY | unassigned | - | 2026-03-19 | BUG-167 | Non-TTY onboarding-required exits once without wrapper respawn loop |
| v0.11.168 | bug | BUG-168 missing runtime config bootstrap (.mbo/config.json) | READY | unassigned | - | 2026-03-19 | BUG-168 | Startup validates/creates local runtime config with explicit remediation |
| v0.11.157 | bug | BUG-157 Operator empty response failure | DEFERRED | unassigned | - | 2026-03-19 | BUG-157 | Operator always returns answer or clarifying question |
| v0.11.161 | bug | BUG-161 context_pinning convergence delay | DEFERRED | unassigned | - | 2026-03-19 | BUG-161 | Low-complexity loops converge in < 2 passes |
| v0.11.162 | bug | BUG-162 FILES prompt empty validation | READY | unassigned | - | 2026-03-19 | BUG-162 | FILES prompt validates non-empty where required |
| v0.11.165 | bug | BUG-165 MCP symlink stale + AGENTS.md Section 11 wrong command | READY | unassigned | - | 2026-03-19 | BUG-165 | mcp.json always live after startup; AGENTS.md Section 11 corrected |
| v0.11.164 | bug | BUG-164 setup self-run/root guard bypass | READY | unassigned | - | 2026-03-19 | BUG-164 | Controller-root run fails closed and never opens runtime prompt |
| v0.11.36 | docs | Workflow canonicalization and validator enforcement | COMPLETED | codex | - | 2026-03-19 | BUG-152..163 | Milestone 1.1 hardening cluster resolved |

---

## Recently Completed
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.168 | bug | BUG-168 missing runtime config bootstrap (.mbo/config.json) | COMPLETED | codex | codex/e2e-alpha-loop | 2026-03-19 | BUG-168 | Startup validates/creates local runtime config with explicit remediation |
| v0.11.167 | bug | BUG-167 non-TTY onboarding failure respawn loop | COMPLETED | codex | codex/e2e-alpha-loop | 2026-03-19 | BUG-167 | Non-TTY onboarding-required exits once without wrapper respawn loop |
| v0.11.166 | bug | BUG-166 global install relay socket path EACCES crash loop | COMPLETED | codex | codex/e2e-alpha-loop | 2026-03-19 | BUG-166 | Global install resolves relay socket under runtime root and launches cleanly |
| v0.11.163 | bug | BUG-163 Operator execution loop scope drift | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-163 | Sticky world/files and scope-loss hard-fail |
| v0.11.160 | bug | BUG-160 Hint injection label mangling | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-160 | ALIVE ticker cleared to prevent TTY character bleed |
| v0.11.159 | bug | BUG-159 Ledger generation failure | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-159 | Replaced JSON parser with resilient section extractor |
| v0.11.158 | bug | BUG-158 WORLD context drift | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-158 | Immutable World/File locks enforced across pipeline |
| v0.11.156 | bug | BUG-156 Spec refinement gate on read-only | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-156 | Read-only bypass using operator persona implemented |
| v0.11.155 | bug | BUG-155 TM dashboard costing drift | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-155 | Unit-rate counterfactual calculation implemented |
| v0.11.152 | bug | BUG-152 MCP daemon start in setup flow | COMPLETED | gemini | gemini/v0.11.152-153 | 2026-03-19 | BUG-152 | `mbo setup` reliably starts daemon for fresh projects |
| v0.11.153 | bug | BUG-153 State Manager `data/` directory init | COMPLETED | gemini | gemini/v0.11.152-153 | 2026-03-19 | BUG-153 | Fresh projects create `data/` via `initProject` |
| v0.11.154 | bug | BUG-154 Controller drift false-positive warning | COMPLETED | gemini | gemini/v0.11.152-153 | 2026-03-19 | BUG-154 | Warning only triggers in source controller repo |
| v0.11.86 | bug | BUG-086 root-mismatch re-onboarding validation round 2 | COMPLETED | gemini | gemini/bug-086-revalidate | 2026-03-19 | BUG-086 | Fixed legacy profile drift and missing root check |
| v0.11.96 | docs | Deprecate NEXT_SESSION governance path | COMPLETED | codex | - | 2026-03-19 | BUG-141 | NEXT_SESSION removed from required protocol |
