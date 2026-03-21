## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-185
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / vX.Y.ZZ`.
**Version lane rule:** assign the version tag by subsystem: `0.11.x` core/hardening/onboarding/runtime, `0.2.x` scripting/audit/automation, `0.3.x` TUI/operator UX, `0.4.x` multithreading/concurrency.

---

### BUG-175: Packaged install omitted `.npmignore`, bloating tarball and increasing onboarding latency/timeouts | Milestone: 1.1 | OPEN
- **Location:** package release artifact (`mbo-0.11.24.tgz`), repository root ignore metadata
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-20
- **Task:** v0.11.175
- **Description:** In the Alpha worktree, `.npmignore` was not present, so `npm pack` fell back to `.gitignore` and included `.dev/archive`, backups, worktree snapshots, and other heavy artifacts. The packed tarball expanded from expected lightweight package size to ~200MB+, dramatically increasing install churn and first-run startup overhead.
- **Impact:** Package install/setup/onboarding becomes materially slower and less reliable; large artifact inclusion increases risk of transport/install failures and obscures runtime regressions behind packaging noise.
- **Acceptance:** `npm pack` in worktree/controller includes only intended runtime files (no `.dev/**`, `backups/**`, worktree archives, or transient logs), with package size back in expected range.

---

### BUG-176: Onboarding interview can hang indefinitely after user response (no progress/no timeout surface) | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js`, `src/auth/call-model.js` onboarding call path
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-20
- **Task:** v0.11.176
- **Description:** During interactive onboarding in `mbo setup`, after responding to a model prompt, the flow can stall for minutes with no next question, no timeout/error surfaced, and no deterministic recovery signal to the user. Manual interruption is required.
- **Impact:** First-run setup is non-deterministic and can deadlock unattended E2E workflows; operators cannot distinguish transient model delay from stuck state.
- **Acceptance:** Onboarding always advances with bounded response time and explicit error/progress signaling (e.g., timeout surfaced and retry path), never silent indefinite hangs.

---

### BUG-180: TasksOverlay task list is too opaque to operate — no task selection briefing or confirmation flow | Milestone: 1.1 | OPEN
- **Location:** `src/tui/components/TasksOverlay.tsx`, task activation flow
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-20
- **Task:** v0.3.07
- **Description:** The TasksOverlay currently presents a thin list of task IDs/titles without a usable activation flow. On selection, it does not aggregate the linked task context from `projecttracking.md`, `BUGS.md`, `BUGS-resolved.md`, and the canonical spec before work begins. Operators cannot confirm goal, assumptions, acceptance, proposed files, or add missing context/files before activation.
- **Acceptance:** TasksOverlay supports keyboard selection and Enter-to-open. Selecting a task shows an aggregated briefing sourced from governance/spec documents, explicitly states the current understanding of the task, allows operator corrections/additional context/files, and requires explicit confirmation before task context is activated.

---

### BUG-181: Audit gate flow unverified — no tab auto-switch, no border color change, no InputBar [AUDIT] prefix | Milestone: 1.1 | OPEN
- **Location:** `src/tui/App.tsx`, `src/tui/components/InputBar.tsx`, `src/tui/components/PipelinePanel.tsx`
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-20
- **Task:** v0.3.08
- **Description:** During a live TUI run-through, the audit_gate pipeline stage was not tested. The expected behavior — auto-switching to tab [1], changing the pipeline border color to indicate audit state, and prefixing the InputBar with `[AUDIT]` — was not verified and may not be implemented or wired correctly.
- **Acceptance:** When the pipeline enters the `audit_gate` stage, the TUI automatically switches to tab [1], the PipelinePanel border reflects the audit state color, and the InputBar label shows `[AUDIT]` prefix.

---

### BUG-182: SystemPanel MCP section incomplete — health/port unverified, connection uptime missing, no pipeline model display | Milestone: 1.1 | OPEN
- **Location:** `src/tui/components/SystemPanel.tsx`
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-20
- **Task:** v0.3.09
- **Description:** Two issues: (1) SystemPanel's MCP health display (port polling, live up/down status) was not tested during the live TUI run-through — it is unknown whether port polling is wired and health state updates live. (2) The MCP daemon section shows port and health status but not connection uptime (how long the daemon has been running/connected). (3) SystemPanel currently only lists MCP client names from config; it has no section showing which model is assigned to each pipeline stage — that information and the model chooser UI (v0.3.15) both belong here.
- **Acceptance:** SystemPanel MCP section shows port, live health status, and connection uptime. A Pipeline Models section lists each stage → model assignment and is the entry point for the model chooser (v0.3.15).

---

### BUG-183: PipelinePanel scroll unverified — auto-scroll and user-scroll-lock not tested during live streaming | Milestone: 1.1 | OPEN
- **Location:** `src/tui/components/PipelinePanel.tsx`, `src/tui/components/useScrollableLines.ts`
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-20
- **Task:** v0.3.10
- **Description:** Scroll behavior in PipelinePanel during live operator streaming was not tested. Auto-scroll (following new output) and user-scroll-lock (pausing auto-scroll when the user scrolls up, resuming when they return to bottom) are expected behaviors that have not been verified against real streaming output.
- **Acceptance:** PipelinePanel auto-scrolls to bottom during live streaming; manual scroll up pauses auto-scroll; scrolling back to bottom re-engages auto-scroll.

---

### BUG-184: C.purple (blueBright) renders too dark — stage labels, type labels, and panel text unreadable | Milestone: 1.1 | OPEN
- **Location:** `src/tui/colors.ts` — `C.purple`, `C.border.idle`, `C.border.inactive`
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-20
- **Task:** v0.3.17
- **Description:** `C.purple` is mapped to Ink's built-in `blueBright` which renders as a medium blue-purple on dark terminals — too dark for labels, task type indicators, and side panel text where it is used. The built-in 16-color palette has no true bright purple option; fix requires a hex color value (e.g. `#B47FFF` or similar) leveraging Ink/chalk's hex color support. Affects all usages of `C.purple` and `C.border.idle`/`C.border.inactive` which share the same value.
- **Acceptance:** `C.purple` renders as a visibly bright, readable purple/violet on dark terminals. All label and border usages updated consistently.

---

### BUG-177: Governance compliance failure: Required governance file exists: docs/e2e-audit-checklist.md | Milestone: 1.1 | OPEN
- **Location:** workflow audit (governance:gov-file-docs/e2e-audit-checklist.md)
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-21
- **Task:** v0.11.180
- **Description:** Compliance check reported 'missing'.
- **Acceptance:** Issue resolved and workflow audit passes on rerun.
