# projecttracking.md
## Mirror Box Orchestrator — Canonical Task Ledger

**Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]
**Current Version:** 0.3.20+v0.11.181.v0.2.3 (TUI v.3)
**Next Task:** v0.2.04
**Policy:** This file is the single source of truth for work state.

---

## Active Tasks
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.2.04 | audit | Full end-to-end audit against SPEC with completed audit checklist artifact | READY | codex | - | 2026-03-21 | docs/e2e-audit-checklist.md, SPEC.md | Run a full spec-to-implementation audit; complete `docs/e2e-audit-checklist.md` with evidence, verdict, score, and sign-off-ready details; record any gaps as governance follow-ups |
| v0.11.182 | chore | Repository cleanup after audit: remove smoke artifacts, reconcile governance state, and leave branch commit-ready | READY | codex | - | 2026-03-21 | SESSION-HANDOFF-2026-03-20-BATCH | Remove temporary smoke artifacts, ensure tracked audit artifacts are committed intentionally, and leave the worktree clean enough for staging/commit without stray audit debris |

---

## Recently Completed
| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
|---|---|---|---|---|---|---|---|---|
| v0.2.03 | feat | Two-way workflow audit run: one invocation executes mirror + subject with unified verdict and combined artifacts | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | SESSION-HANDOFF-2026-03-20 | Supports `--world both`; preserves single-world mode; deterministic `--push-alpha` behavior; combined summary includes per-world + unified result |
| v0.3.11 | feat | Governance doc viewer: projecttracking, BUGS, BUGS-resolved, CHANGELOG readable in TUI | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | All four governance docs accessible and scrollable from within the TUI |
| v0.3.12 | feat | Inline task creation: natural language input → interview flow → written to projecttracking.md | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | User types add task description; app interviews for details; entry written to projecttracking.md |
| v0.3.13 | feat | Operator activity shimmer: current action label + shimmer animation during operator processing | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | No silent pauses; operator processing shows current action with shimmer highlight animation |
| v0.11.177 | feat | Spec as source of truth: spec built/acquired during onboarding, maintained as primary task detail source | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | Spec generated or acquired in onboarding; task detail aggregation (v0.3.07) uses spec as primary source |
| v0.11.178 | feat | Auto-generate governance docs during onboarding if project has none | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | Onboarding detects missing governance docs and generates projecttracking, BUGS, CHANGELOG stubs |
| v0.11.179 | feat | Pipeline agent governance compliance: spec what applies to prompt agents vs CLI tools | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | Written spec defining governance obligations for prompt agents vs CLI; pipeline agents updated accordingly |
| v0.3.14 | feat | Tokenmiser header: stage-aware model + token display — show active stage's model name and running token count, updating as pipeline advances | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | Header always shows current stage's model and its token count; switches model+count as pipeline stage changes |
| v0.3.15 | feat | Model chooser: setup-time per-stage model selection from OpenRouter catalog with recommendations | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | During `mbo setup` and `/setup`, user selects model per pipeline stage from a list loaded from OpenRouter; each stage shows recommended default + chosen override. Recommendation/selection logic must be reviewed with operator in a design conversation before implementation build-out. |
| v0.3.16 | feat | InputBar /command autocomplete: typing / surfaces available commands with completion | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | Typing / in InputBar shows autocomplete list of available commands; selection completes the command |
| v0.3.18 | feat | Per-panel token display: Pipeline shows pipeline session tokens, Operator panel shows operator tokens | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | Each main panel (Pipeline, Operator, Executor) shows token count relevant to that panel's activity |
| v0.3.19 | feat | Pipeline stage navigation: scroll/jump between stages (classification, planning, tiebreaker A/B, code, dry run) in Pipeline tab | COMPLETED | codex | codex/tui-governance-audit-batch-2 | 2026-03-20 | - | Pipeline tab has stage-level navigation; user can scroll between discrete pipeline stage sections |
| v0.3.17 | bug | BUG-184 C.purple too dark — blueBright unreadable for labels/borders; fix with hex color | COMPLETED | claude | gemini/bugs-3.20.26.2009 | 2026-03-20 | BUG-184 | C.purple renders as bright readable purple/violet on dark terminals; all usages updated consistently |
| v0.3.10 | bug | BUG-183 PipelinePanel scroll: auto-scroll and user-scroll-lock re-engagement | COMPLETED | claude | gemini/bugs-3.20.26.2009 | 2026-03-20 | BUG-183 | PipelinePanel auto-scrolls during streaming; user scroll locks auto-scroll until re-engaged |
| v0.3.09 | bug | BUG-182 SystemPanel MCP health: port polling and live health display | COMPLETED | claude | gemini/bugs-3.20.26.2009 | 2026-03-20 | BUG-182 | SystemPanel correctly polls MCP ports and displays live health status |
| v0.3.08 | bug | BUG-181 Audit gate flow: tab auto-switch to [1], pipeline border color, InputBar [AUDIT] prefix | COMPLETED | claude | gemini/bugs-3.20.26.2009 | 2026-03-20 | BUG-181 | TUI responds correctly to audit_gate stage across all three visual indicators |
| v0.3.07 | bug | BUG-180 TasksOverlay: scrollable cursor, Enter-to-select, on-select aggregates spec+bugs+projecttracking | COMPLETED | claude | gemini/bugs-3.20.26.2009 | 2026-03-20 | BUG-180 | Scrollable task list with cursor; Enter aggregates all source docs and shows briefing |
| v0.11.180 | bug | BUG-177 workflow audit governance-file compliance false failure for docs/e2e-audit-checklist.md | COMPLETED | unassigned | gemini/bugs-3.20.26.2009 | 2026-03-21 | BUG-177 | Workflow audit no longer reports docs/e2e-audit-checklist.md missing when the file exists; governance compliance passes on rerun |
| v0.11.176 | bug | BUG-176 onboarding interview hangs without timeout/progress recovery | COMPLETED | unassigned | gemini/bugs-3.20.26.2009 | 2026-03-20 | BUG-176 | Onboarding has bounded timeout + explicit retry/error path; no indefinite silent stall |
| v0.11.175 | bug | BUG-175 package artifact bloat from missing .npmignore in worktree | COMPLETED | codex | gemini/bugs-3.20.26.2009 | 2026-03-20 | BUG-175 | Packed artifact excludes .dev/backups/worktree archives; package size returns to expected range |
| v0.11.181 | docs | Governance: version-lane bug labeling + required pre-push governance sync | COMPLETED | codex | - | 2026-03-21 | AGENTS.md §6B.1, §17 | Defined subsystem-to-version lane mapping, grandfathered BUG-001..184, required dual bug/version labels from BUG-185 forward, and made governance reconciliation mandatory before push/session wrap |
| v0.3.20 | docs | Spec candidate synthesis + governance wording alignment (TasksOverlay activation + setup-time model chooser requirements) | COMPLETED | codex | - | 2026-03-20 | SPEC.md Section 37 | Consolidated into SPEC Section 37; projecttracking language aligned for v0.3.07 and v0.3.15 requirements |
| v0.3.06 | docs | AGENTS.md Section 17: Version Bump Protocol | COMPLETED | claude | - | 2026-03-20 | AGENTS.md §17 | Governance enforces app version sync, user confirmation, and change documentation on every bump |
| v0.3.05 | docs | CHANGELOG: add 0.3.01 TUI entry, 0.2.02 auto-run entry; correct 0.2.01 label | COMPLETED | claude | - | 2026-03-20 | CHANGELOG | CHANGELOG accurately reflects v2 (auto-run) and v3 (TUI) milestones with correct labels |
| v0.2.02 | feat | Workflow audit / auto-run script (scripts/mbo-workflow-audit.js + generate-run-artifacts.js) | COMPLETED | codex | - | 2026-03-20 | CHANGELOG-0.2.02 | End-to-end audit runner with alpha execution option, artifact generation, and onboarding seed |
| v0.3.03 | feat | TUI v.3: Ink v5 + React terminal UI (src/tui/) | COMPLETED | claude | - | 2026-03-20 | CHANGELOG-0.3.01 | Full 4-tab TUI with StatsPanel sidebar, StatsOverlay, TasksOverlay, Tokenmiser header, canonical palette, ESM island |
| v0.3.02 | bug | Version drift: package.json stale at 0.11.24 while CHANGELOG at 0.2.01 | COMPLETED | claude | - | 2026-03-20 | - | package.json version matches CHANGELOG head (0.3.01); StatusBar displays correct version |
| v0.3.01 | bug | TUI subcommand fallthrough: mbo <unknown> silently launched operator instead of erroring | COMPLETED | claude | - | 2026-03-20 | - | Any unrecognised subcommand (e.g. mbo tur) exits with clear error; operator loop not spawned |
| v0.11.174 | bug | BUG-174 _computeScanInputSignal sync fs scan blocks event loop | COMPLETED | claude | claude/mcp-server-hardening | 2026-03-20 | BUG-174 | Scan signal computation is async; no synchronous fs calls in hot path |
| v0.11.173 | bug | BUG-173 keepAliveTimeout exceeds launchd exit timeout causes dirty SIGKILL | COMPLETED | claude | claude/mcp-server-hardening | 2026-03-20 | BUG-173 | SIGTERM completes clean shutdown within 5s; no dangling PID/symlink state |
| v0.11.172 | bug | BUG-172 enqueueWrite permanently poisons write queue after error | COMPLETED | claude | claude/mcp-server-hardening | 2026-03-20 | BUG-172 | Single write error does not block future enqueueWrite calls |
| v0.11.171 | bug | BUG-171 execSync no timeout freezes event loop on hung git | COMPLETED | claude | claude/mcp-server-hardening | 2026-03-20 | BUG-171 | graph_rescan_changed with hung git times out in 5s; HTTP server stays responsive |
| v0.11.170 | bug | BUG-170 first-launch missing-config should force setup before operator prompt | COMPLETED | unassigned | - | 2026-03-19 | BUG-170 | First launch with missing required config runs setup/fail-closed; never drops user to operator prompt |
| v0.11.169 | bug | BUG-169 DID tiebreaker null-verdict silent convergence | COMPLETED | claude | - | 2026-03-19 | BUG-169 | Tiebreaker null-verdict escalates to needs_human; no convergent package emitted without finalDiff |
| v0.11.165 | bug | BUG-165 MCP symlink stale + AGENTS.md Section 11 wrong command + stale .mbo/AGENTS.md stub | COMPLETED | claude | claude/mcp-server-hardening | 2026-03-20 | BUG-165 | mcp.json always live after startup; AGENTS.md Section 11 corrected to mbo mcp; stale .mbo/AGENTS.md stub and gitignore unignore removed |
| v0.11.164 | bug | BUG-164 setup self-run/root guard bypass | COMPLETED | unassigned | - | 2026-03-19 | BUG-164 | Controller-root run fails closed and never opens runtime prompt |
| v0.11.168 | bug | BUG-168 missing runtime config bootstrap (.mbo/config.json) | COMPLETED | codex | codex/e2e-alpha-loop | 2026-03-19 | BUG-168 | Startup validates/creates local runtime config with explicit remediation |
| v0.11.167 | bug | BUG-167 non-TTY onboarding failure respawn loop | COMPLETED | codex | codex/e2e-alpha-loop | 2026-03-19 | BUG-167 | Non-TTY onboarding-required exits once without wrapper respawn loop |
| v0.11.166 | bug | BUG-166 global install relay socket path EACCES crash loop | COMPLETED | codex | codex/e2e-alpha-loop | 2026-03-19 | BUG-166 | Global install resolves relay socket under runtime root and launches cleanly |
| v0.11.163 | bug | BUG-163 Operator execution loop scope drift | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-163 | Sticky world/files and scope-loss hard-fail |
| v0.11.162 | bug | BUG-162 FILES prompt empty validation | COMPLETED | unassigned | - | 2026-03-19 | BUG-162 | FILES prompt validates non-empty where required |
| v0.11.161 | bug | BUG-161 context_pinning convergence delay | COMPLETED | unassigned | - | 2026-03-19 | BUG-161 | Low-complexity loops converge in < 2 passes |
| v0.11.160 | bug | BUG-160 Hint injection label mangling | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-160 | ALIVE ticker cleared to prevent TTY character bleed |
| v0.11.159 | bug | BUG-159 Ledger generation failure | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-159 | Replaced JSON parser with resilient section extractor |
| v0.11.158 | bug | BUG-158 WORLD context drift | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-158 | Immutable World/File locks enforced across pipeline |
| v0.11.157 | bug | BUG-157 Operator empty response failure | COMPLETED | unassigned | - | 2026-03-19 | BUG-157 | Operator always returns answer or clarifying question |
| v0.11.156 | bug | BUG-156 Spec refinement gate on read-only | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-156 | Read-only bypass using operator persona implemented |
| v0.11.155 | bug | BUG-155 TM dashboard costing drift | COMPLETED | gemini | gemini/milestone-1.1-hardening-final | 2026-03-19 | BUG-155 | Unit-rate counterfactual calculation implemented |
| v0.11.152 | bug | BUG-152 MCP daemon start in setup flow | COMPLETED | gemini | gemini/v0.11.152-153 | 2026-03-19 | BUG-152 | `mbo setup` reliably starts daemon for fresh projects |
| v0.11.153 | bug | BUG-153 State Manager `data/` directory init | COMPLETED | gemini | gemini/v0.11.152-153 | 2026-03-19 | BUG-153 | Fresh projects create `data/` via `initProject` |
| v0.11.154 | bug | BUG-154 Controller drift false-positive warning | COMPLETED | gemini | gemini/v0.11.152-153 | 2026-03-19 | BUG-154 | Warning only triggers in source controller repo |
| v0.11.86 | bug | BUG-086 root-mismatch re-onboarding validation round 2 | COMPLETED | gemini | gemini/bug-086-revalidate | 2026-03-19 | BUG-086 | Fixed legacy profile drift and missing root check |
| v0.11.36 | docs | Workflow canonicalization and validator enforcement | COMPLETED | codex | - | 2026-03-19 | BUG-152..163 | Milestone 1.1 hardening cluster resolved |
| v0.11.96 | docs | Deprecate NEXT_SESSION governance path | COMPLETED | codex | - | 2026-03-19 | BUG-141 | NEXT_SESSION removed from required protocol |
