# projecttracking.md
## Mirror Box Orchestrator — Canonical Task Ledger

**Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]
**Next Task:** v0.11.61
**Policy:** This file is the single source of truth for work state.

---

## Active Tasks
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.99 | bug | BUG-119 verification audit — confirm chat-native onboarding UX fix is fully effective | READY | unassigned | - | 2026-03-19 | BUG-119 | BUG-119 confirmed RESOLVED or re-opened with specific failure evidence |
| v0.11.61 | bug | BUG-061 Merkle scope + MCP query path drift closure | READY | gemini | gemini/bug-061-closure | 2026-03-17 | BUG-061 | Merkle scope contract implemented + non-src drift tests + standardized `node scripts/mcp_query.js` path |
| v0.11.36 | docs | Workflow canonicalization and validator enforcement | IN_PROGRESS | codex | codex/e2e-20260318-212502 | 2026-03-19 | BUG-048,BUG-086,BUG-136,BUG-138,BUG-139,BUG-140,BUG-141,BUG-142,BUG-144,BUG-147,BUG-148 | BUG-147 (onboarding JSON protocol) and BUG-148 (operator JSON prompts) fixed; BUG-144 resolved as downstream; remaining: installer-first Alpha E2E acceptance run with TTY transcript |
| v0.11.93 | bug | Runtime auto-heal MCP init + default incremental rescan workflow + onboarding JSON leak closure | READY | codex | codex/v0.11.93-mcp-autorecovery-incremental | 2026-03-18 | BUG-119,BUG-136,BUG-137 | `mbo` self-recovers from MCP uninitialized/stale states without manual `mbo mcp`; normal close/start path avoids full DB rebuild unless explicit/corruption-gated; onboarding never renders raw JSON to users |

---

## Recently Completed
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.98 | bug | Add `graph_query` MCP alias for Codex tool discovery compatibility | COMPLETED | codex | codex/v0.11.98-graph-query-alias | 2026-03-19 | - | `mbo-graph` exports `graph_query` as an alias for impact queries, `node scripts/mcp_query.js tools_list` shows the alias live, and `node scripts/test-mcp-server.js` passes |
| v0.11.97 | bug | Codex MCP client config auto-refresh on daemon start | COMPLETED | codex | codex/codex-mcp-client-refresh | 2026-03-19 | - | `updateClientConfigs()` refreshes Codex in `~/.codex/config.toml` using the live daemon port, preserves unrelated Codex settings, and targeted client-config tests pass |
| v0.11.96 | docs | Deprecate NEXT_SESSION governance path + BUGS split canonicalization | COMPLETED | codex | codex/e2e-20260318-212502 | 2026-03-19 | BUG-141,BUG-142,BUG-143 | NEXT_SESSION removed from required protocol/docs/templates; BUGS.md active-only with BUGS-resolved.md archive policy enforced |
| v0.11.94 | bug | Post-Collapse Remediation: Symlink/Path/JSON/Fixes | COMPLETED | gemini | master | 2026-03-18 | BUG-119 | Removed root symlink; relocated personalities; converted enrich to fire-and-forget; added --diagnose to info; cleaned .mbo/ artifacts; removed legacy HANDOFF_MD_PATH; implemented robust JSON extraction |
| COLLAPSE-05 | docs | Acceptance: invariant renumber cross-reference scope defined | COMPLETED | claude | claude/collapse-01 | 2026-03-18 | COLLAPSE-01 | 16-file cross-reference list captured in acceptance criteria; renumber execution deferred to BACKLOG |
| v0.11.92 | docs | COLLAPSE-03 sync `src/templates/AGENTS.md` to governance v1.1 | COMPLETED | claude | claude/collapse-03 | 2026-03-18 | COLLAPSE-03,COLLAPSE_HANDOFF_20260318b.md | Client template includes applicable invariants; `docs/agent-onboarding.md` stale NEXT_SESSION paths fixed; BUG-135 logged; validator clean |
| v0.11.91 | docs | C5 migrate TECHNICAL_DEBT items to BUGS and archive TECHNICAL_DEBT.md | COMPLETED | claude | claude/collapse-c5 | 2026-03-18 | BUG-131,BUG-132,BUG-134 | BUG-131/132/134 logged; TECHNICAL_DEBT.md moved to `.dev/archive/governance-artifacts/`; validator clean |
| COLLAPSE-04 | docs | NEXT_SESSION.md path consolidation to .mbo/sessions/ only | COMPLETED | claude | claude/collapse-02-04 | 2026-03-18 | COLLAPSE-01 | Canonical write to `.mbo/sessions/NEXT_SESSION.md`; curl MCP block replaced with mcp_query.js |
| COLLAPSE-03 | docs | Sync src/templates/AGENTS.md to governance v1.1 | COMPLETED | claude | claude/collapse-03 | 2026-03-18 | COLLAPSE_HANDOFF_20260318b.md | Client template synced; BUG-135 logged for init-project.js stub gap |
| COLLAPSE-02 | docs | STATE.md creation (deprecated — removed in favor of single-source governance) | COMPLETED | claude | claude/collapse-02-04 | 2026-03-18 | COLLAPSE-01 | Historical task only; STATE surface removed |
| COLLAPSE-01 | docs | Collapse .dev/governance/AGENTS.md — merge sources, apply C1-C6 | COMPLETED | claude | claude/collapse-01 | 2026-03-18 | COLLAPSE_HANDOFF_20260318.md | Written to .dev/governance/AGENTS.md v1.1; DID reconciliation A+B+C complete |
| v0.11.86 | bug | BUG-086 root-mismatch re-onboarding validation round 2 | COMPLETED | gemini | gemini/bug-086-revalidate | 2026-03-18 | BUG-086 | Code confirmed done at onboarding.js lines 334-358; guard corrected |
| v0.11.52 | bug | BUG-052 global mbo CLI entrypoint packaging | COMPLETED | codex | codex/bug-052-cli-entrypoint | 2026-03-18 | BUG-052 | bin/mbo.js created, package.json bin field added |
| v0.11.22 | feature | Adaptive Onboarding v2 Intelligence Layer (UX-022..UX-028) | COMPLETED | codex | codex/onboarding-v2-ux-elevation | 2026-03-17 | BUG-093,BUG-094,BUG-095,BUG-096,BUG-097,BUG-098,BUG-099,BUG-100,BUG-101 | Merged to master and `scripts/test-onboarding.js` 8/8 pass |
| v0.10.09 | feature | Sovereign Loop (Self-Patching Validation) | COMPLETED | gemini | gemini/onboarding-v2 | 2026-03-16 | 1.0-09 | Verification gate pass recorded |

---

## Backlog
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.11.63 | bug | Harden macOS auth fallback explicit user-presence prompt | BACKLOG | unassigned | - | 2026-03-17 | BUG-063 | Deterministic user-presence prompt semantics validated |
| v0.12.01 | feature | Cross-agent cost comparison — per-task model-tier cost rollup and value proof | BACKLOG | unassigned | - | 2026-03-19 | BUG-150 | `getCostRollup()` in db-manager; `getStatus()` emits routing savings block; tokenmiser SHIFT+T overlay includes ROUTING SAVINGS section; live-tested against mirrorbox.db |
| 1.1-H13 | task | Directory structure cleanup | BACKLOG | unassigned | - | 2026-03-18 | - | Directory structure normalized per governance contract |
| 1.1-H26 | feature | Persona Store & Entropy Gate | BACKLOG | unassigned | - | 2026-03-18 | - | Persona store implemented; entropy gate enforced per Section 41 |
| 1.1-H27 | feature | Agent Output Streaming (Section 33) | BACKLOG | unassigned | - | 2026-03-18 | - | Streaming output implemented per Section 33 contract |
| 1.1-H29 | feature | Context Minimization (Section 35) | BACKLOG | unassigned | - | 2026-03-18 | - | Context budget enforced per Section 35 contract |
| DDR-001 | feature | Conversational Agent Output Layer (Section 40) | BACKLOG | unassigned | - | 2026-03-18 | - | No stage IDs in primary display; every error has recommended action |
| DDR-002 | feature | Persona System SPEC section (Section 41) | BACKLOG | unassigned | - | 2026-03-18 | - | Persona store sovereign; assignment per role per task |
| DDR-003 | feature | Dev Workflow Alignment (Section 42) | BACKLOG | unassigned | - | 2026-03-18 | - | MBO dev follows same governance protocol it enforces on client projects |
| TECH_DEBT-01 | task | OpenAI CLI round-trip verification | BACKLOG | unassigned | - | 2026-03-18 | BUG-131 | Authenticated OpenAI CLI round-trip validated through MBO auth path |
| TECH_DEBT-02 | task | Ollama round-trip verification | BACKLOG | unassigned | - | 2026-03-18 | BUG-132 | Ollama detection and /api/generate round-trip validated |
| COLLAPSE-05 | docs | Renumber AGENTS.md invariants to eliminate gaps (1-9, 14, 18) | BACKLOG | unassigned | - | 2026-03-18 | COLLAPSE-01 | Invariants renumbered sequentially across ALL files — full cross-reference surface: .dev/governance/AGENTS.md, src/templates/AGENTS.md, src/auth/call-model.js, src/auth/operator.js, src/auth/did-orchestrator.js, src/state/event-store.js, src/state/state-manager.js, src/state/redactor.js, src/graph/graph-store.js, src/sandbox/sandbox-manager.js, scripts/test-invariants.js, scripts/verify-chain.js, scripts/test-redactor.js, scripts/test-redactor-v2.js, docs/agent-onboarding.md, docs/invariant-audit.md |

---

## Status Vocabulary
- `BACKLOG`: defined but not scheduled
- `READY`: approved and ready to execute
- `IN_PROGRESS`: currently being implemented
- `BLOCKED`: cannot proceed; blocker must be explicit in `Links`
- `COMPLETED`: accepted with evidence in `Acceptance`
