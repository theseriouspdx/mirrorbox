## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-178

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

### BUG-170: First-launch missing-config path drops into operator prompt instead of forcing setup-first UX contract | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js`, `src/index.js`, onboarding/setup handoff
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.170
- **Description:** On first launch from a package install, when required runtime configuration is not fully established, the user can still be dropped into the interactive `MBO ... >` operator prompt path instead of being forced through `mbo setup` first. This violates the setup-first UX requirement that the operator must not expose an unusable prompt state to end users.
- **Spec linkage:** `.dev/spec/SPEC.md` Section 36.1 (predictive guided onboarding contract) and Milestone 1.1 acceptance criteria (setup/onboarding guard behavior).
- **Impact:** New users can enter an ambiguous runtime state before setup is complete, causing confusion and recoverability friction.
- **Acceptance:** Fresh first launch with missing required config must deterministically run setup flow (or fail closed with explicit remediation) and must not drop the user into the operator command prompt until setup prerequisites are satisfied.

---

### BUG-169: DID tiebreaker null-verdict — unparseable tiebreaker response silently declares convergence with null finalDiff | Milestone: 1.1 | OPEN
- **Location:** `src/auth/did-orchestrator.js` — Stage 5 tiebreaker exit path and `_package()`
- **Severity:** P1
- **Status:** OPEN — observed live 2026-03-19
- **Task:** v0.11.169
- **Description:** When the tiebreaker model response lacks a parseable `VERDICT:` section and `FINAL DIFF:` section (e.g. plain-English or malformed output), `tbVerdict` collapses to `''` and `finalDiff` is `null`. The code fell through to `_package(..., 'convergent')` with a null diff, falsely signalling plan convergence. The operator's `!didPackage.did.finalDiff` guard then returned `needsTiebreaker: true` — a meaningless state since the tiebreaker had already run — rather than surfacing a human escalation.
- **Impact:** Live Tier 2/3 tasks silently returned a structureless "convergent" plan with no diff; operator entered an unrecoverable `needsTiebreaker` holding state with no user-facing escalation path.
- **Root cause:** No explicit null-verdict guard in Stage 5 exit path; `_package()` had no defensive check preventing `convergent` + null `finalDiff` from being emitted.
- **Fix:** (1) Explicit guard in Stage 5: if `!tbVerdict && !finalDiff`, return `needs_human` immediately. (2) Defensive guard in `_package()`: any `convergent` verdict with null `finalDiff` is promoted to `needs_human`. Both guards emit `DID_RECONCILIATION_PACKAGE` with the corrected verdict.
- **Acceptance:** Live Tier 2/3 task with unparseable tiebreaker response surfaces `escalatedToHuman: true` to the operator, not `needsTiebreaker: true`. No `convergent` package is ever emitted without a non-null `finalDiff`.

---

### BUG-166: Global install runtime resolves relay socket under package root causing EACCES and crash loop | Milestone: 1.1 | OPEN
- **Location:** `src/relay/relay-listener.js`, runtime bootstrap in `src/index.js`
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.166
- **Description:** In globally-installed execution (`npm install -g`), `relay-listener` binds `relay.sock` under `.../lib/node_modules/mbo/.dev/run/relay.sock` via `__dirname`-relative path resolution. That package path is not writable for runtime socket creation in normal user execution, producing `listen EACCES` and repeated operator crash/respawn loops.
- **Impact:** Onboarding can complete but runtime cannot remain up. `mbo` repeatedly respawns and cannot enter stable interactive operation from a package install.
- **Acceptance:** Relay socket and incident flag resolve against runtime project root (`MBO_PROJECT_ROOT`/`cwd`) instead of package source root; global install launches without `EACCES` and without crash loop.

### BUG-167: Non-TTY onboarding failure enters uncontrolled respawn loop instead of fail-closed exit | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js` (respawn supervisor behavior), `src/index.js` non-TTY onboarding guard
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.167
- **Description:** When onboarding is required and `mbo` runs in non-TTY mode, `src/index.js` correctly emits `ERROR: Non-TTY launch requires onboarding...` and exits, but the CLI wrapper immediately respawns the operator repeatedly. This creates noisy infinite failure loops instead of a single terminal failure.
- **Impact:** Automation and scripted checks cannot detect clean failure semantics; logs flood and process churn increases.
- **Acceptance:** For deterministic startup failures (including non-TTY onboarding required), wrapper exits once with non-zero status and no respawn loop.

---


### BUG-168: Missing runtime config bootstrap (`.mbo/config.json`) causes startup ambiguity in fresh installs | Milestone: 1.1 | OPEN
- **Location:** `bin/mbo.js`, `src/cli/setup.js`, `src/index.js`
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.168
- **Description:** Fresh package-installed runs can enter mixed startup states when local runtime config (`.mbo/config.json`) is absent or incomplete while global config exists. Error messaging and guard flow are inconsistent across setup/runtime paths, making failures look like a missing "config js/json" bootstrap issue.
- **Impact:** Operators see confusing startup behavior during first-run automation and non-interactive checks; root-cause diagnosis is slowed.
- **Acceptance:** Startup path deterministically creates or validates required local runtime config before operator launch, and failure messaging points to exact missing config file and remediation.

---

### BUG-165: MCP symlink not updated on new server startup; AGENTS.md Section 11 documents wrong recovery command | Milestone: 1.1 | OPEN
- **Location:** `src/graph/mcp-server.js` (startup symlink logic, line ~826–830), `.dev/governance/AGENTS.md` (Section 11)
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.165
- **Description:** Two related issues:
  1. When a new `mbo mcp` instance starts after a prior instance crashed, the startup symlink creation silently fails. The stale dangling `mcp.json → mcp-<id>-<dead-pid>.json` symlink is never removed before the new one is written. The failure is swallowed by `try/catch` (line 830), leaving `mcp.json` broken even though the new server is live and healthy. Confirmed: two live servers running (PIDs 49161, 69899) but `mcp.json` still points to dead PID 52653.
  2. AGENTS.md Section 11 documents `mbo setup` as the command to start the dev graph server. This is incorrect — `mbo setup` enters the onboarding/workflow prompt. The correct restart command is `mbo mcp`.
- **Root cause:** (1) No dangling-symlink detection before new symlink creation; error swallowed silently. (2) AGENTS.md Section 11 was authored with the wrong command.
- **Acceptance:** (1) On `mbo mcp` startup, if `mcp.json` is a broken symlink (target file absent), it is removed before the new pidManifest symlink is written. `mcp.json` always points to a live manifest after startup. (2) AGENTS.md Section 11 start command reads `mbo mcp`, not `mbo setup`. (3) Stale 2-line `.mbo/AGENTS.md` stub removed and corresponding `!.mbo/AGENTS.md` unignore entry removed from `.gitignore` — SPEC mandates one AGENTS.md per project at `.mbo/AGENTS.md`; the controller repo's stub is orphaned and misleads agents reading it.

### BUG-157: Operator did not answer the question | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js`, gate exit behavior
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-19 (related to BUG-156)
- **Task:** v0.11.157
- **Description:** After the gate fired and ran entropy scoring, the operator returned only scaffolding output with no answer. Even if the gate correctly fires, it should either (a) answer from known state before presenting the gate, or (b) ask one targeted clarifying question — not block entirely and return nothing useful.
- **Acceptance:** Every operator response includes either a direct answer or a single targeted clarifying question. Returning only gate scaffolding with no answer is a failure mode.

### BUG-161: context_pinning runs 5 passes for COMPLEXITY:1 no-file analysis route | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` (context_pinning loop exit condition)
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.161
- **Description:** 5 passes of context_pinning for `ROUTE: analysis`, `COMPLEXITY: 1`, `FILES: none`. Loop is not converging or has a bad exit condition for simple low-complexity routes.
- **Acceptance:** context_pinning for COMPLEXITY:1 with no files converges in 1-2 passes maximum.

### BUG-162: FILES prompt accepts empty input without validation | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js` or `src/cli/` (FILES prompt validation)
- **Severity:** P2
- **Status:** OPEN — observed 2026-03-19
- **Task:** v0.11.162
- **Description:** FILES prompt fired and accepted empty input with no validation. If certain route types require files, the gate should block empty file lists. If FILES is optional for this route, the prompt should not fire at all.
- **Acceptance:** FILES prompt either (a) does not fire when files are not required for the route, or (b) validates that required file lists are non-empty before proceeding.


### BUG-177: Governance compliance failure: Required governance file exists: docs/e2e-audit-checklist.md | Milestone: 1.1 | OPEN
- **Location:** workflow audit (governance:gov-file-docs/e2e-audit-checklist.md)
- **Severity:** P1
- **Status:** OPEN — observed 2026-03-21
- **Task:** v0.11.176
- **Description:** Compliance check reported 'missing'.
- **Acceptance:** Issue resolved and workflow audit passes on rerun.
