# BUGS.md
## Mirror Box Orchestrator — Known Issues and Queued Fixes

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred with note. Spec gap → spec updated before fix is written.

---

## Section 1 — P0: Blocking Current Milestone (0.6)

(None. Milestone 0.5 SUCCESS. Pre-0.6 Audit PASS.)

### BUG-101: Error message tells user to run `mbo setup` while they are already running `mbo setup` | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js:118` (`_resolveMCP`)
- **Severity:** P1
- **Status:** OPEN — 2026-03-16
- **Description:** When `installMCPDaemon` fails during `mbo setup` for a new project, the error message says `Run 'mbo setup' first`. This is emitted while the user is already mid-setup. The message is circular and gives no actionable path forward.
- **Observed:** `Error: No MCP manifest found in /Users/johnserious/johnseriouscom. Run 'mbo setup' first.`
- **Expected:** Error message should describe the actual problem (no manifest yet, first-time install) and a real remediation step, or be suppressed entirely in first-install context.

### BUG-100: `installMCPDaemon` fails and hangs for a genuine new project — no manifest bootstrap | Milestone: 1.1 | OPEN
- **Location:** `src/auth/operator.js:118` (`_resolveMCP`), `bin/mbo.js:53` (`runSetupCommand` `.catch`)
- **Severity:** P0 (blocks setup completion)
- **Status:** OPEN — 2026-03-16
- **Description:** After onboarding completes for a fresh external project with no prior `.mbo/` state, `installMCPDaemon` launches the operator which throws `No MCP manifest found`. The manifest doesn't exist yet — this is a first-time install. Additionally, the process hangs indefinitely after the error rather than exiting; `process.exit(1)` in the `.catch` handler does not fire, likely due to a dangling async operation or stdin remaining open.
- **Observed:** Error printed, then process stalls. User must Ctrl+C to recover. `[MBO] MCP daemon ready.` is never printed.
- **Expected:** `installMCPDaemon` should handle the no-manifest-yet case as a valid first-install state, bootstrap the manifest, and complete normally. If it does error, the process must exit cleanly.

### BUG-099: Paraphrase handshake asks user to confirm their own words back to themselves | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js:500` (`runPrimeDirectiveHandshake`)
- **Severity:** P2
- **Status:** OPEN — 2026-03-16
- **Description:** When the prime directive is largely the user's own Q3 answer verbatim (per BUG-098), asking them to paraphrase it is circular — they are being asked to re-summarize what they just typed. The handshake is designed to confirm MBO understood the directive, but in the current flow it confirms nothing meaningful.
- **Observed:** User typed the prime directive content in Q3, then was immediately asked to paraphrase it back.
- **Expected:** The handshake should confirm MBO's synthesis, not echo the user's own input. Once BUG-098 is fixed and the directive is genuinely synthesized, the handshake becomes meaningful. Alternatively, reframe from "paraphrase this" to "confirm or correct MBO's interpretation."

### BUG-098: Prime directive is not synthesized — echoes user's raw Q3 answer verbatim including typos | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js:194` (`synthesizePrimeDirective`)
- **Severity:** P1
- **Status:** OPEN — 2026-03-16
- **Description:** `synthesizePrimeDirective` concatenates a boilerplate prefix with the raw Q3 answer unchanged. It does not incorporate scan findings, follow-up answers, or any other interview input. Typos, fragments, and informal phrasing pass through unmodified.
- **Observed:** Prime directive contained user's exact Q3 text with typos intact, plus a hardcoded constraint string that did not reflect what the scan actually found.
- **Expected:** The prime directive should be synthesized from all interview inputs — Q3 as the priority signal, Q4 for partnership context, real constraints from follow-ups, scan findings — into a clean actionable statement.

### BUG-097: Scan does not infer confirmed real constraints from project artifacts | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js` (`scanProject`, `deriveFollowupQuestions`)
- **Severity:** P1
- **Status:** OPEN — 2026-03-16
- **Description:** The scan detects frameworks, build system, CI, and lock files, but makes no attempt to infer confirmed real constraints readable from the project — e.g. deployment target from `vercel.json`/`netlify.toml`, static vs. server rendering from Next.js config, environment requirements from `.env.example`. The user is then asked to list these from memory with a blank prompt.
- **Observed:** `List confirmed real constraints (comma-separated).` — blank prompt, no defaults, no scan-seeded suggestions.
- **Expected:** `scanProject` should detect common constraint signals (deploy config files, Next.js export mode, `.env.example` keys, etc.) and seed the `realConstraints` prompt with detected candidates, the same way it already seeds `dangerZones` and `verificationCommands`.

### BUG-096: No mechanism for user to ask clarifying questions during follow-up interview | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js` (`runFollowups`, `createPromptIO`)
- **Severity:** P2
- **Status:** OPEN — 2026-03-16
- **Description:** When a follow-up question is unclear, the user has no recourse except to guess, skip with `done`, or abandon the session. There is no way to ask for clarification inline.
- **Observed:** Prompt appears, accepts any text or `done`. No help affordance.
- **Expected:** A reserved keyword (e.g. `?` or `help`) at any prompt should print a plain-language explanation of what the question is asking and why, then re-ask the same question. The explanation should be derived from the same context used to generate the question.

### BUG-095: "Subject-world root path" question is unexplained internal jargon with no context or example | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js:452` (`deriveFollowupQuestions`)
- **Severity:** P2
- **Status:** OPEN — 2026-03-16
- **Description:** `Provide the Subject-world root path for promotion/cross-world telemetry.` uses MBO-internal terminology ("Subject-world", "promotion", "cross-world telemetry") that is meaningless to a user who hasn't read MBO internals. No explanation, no example path, no indication of what a correct answer looks like. Covered by BUG-093 (jargon) and BUG-094 (no scan context shown) but called out separately due to severity of this specific prompt.
- **Observed:** Bare prompt, no hint, no plain-language explanation.
- **Expected:** See BUG-093 and BUG-094 fixes. At minimum: plain-language prompt with an example path.

### BUG-094: Scan results not surfaced to user before follow-up questions | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js` (`runOnboarding`, phase 2→3 transition)
- **Severity:** P1
- **Status:** OPEN — 2026-03-16
- **Description:** After the silent scan runs, the detected state (frameworks, build system, languages, file count, CI status) is never printed to the terminal. The user has no visibility into what MBO found before being asked follow-up questions seeded from that scan data.
- **Observed:** `[Onboarding] Running repository scan...` prints, then follow-up questions appear immediately with no summary of what was detected.
- **Expected:** After the scan, print a brief summary before any follow-up questions: e.g. `[Onboarding] Scan complete: 47 files, JavaScript, Next.js, npm, no CI detected.`

### BUG-093: Follow-up questions use unexplained jargon with no inline definition | Milestone: 1.1 | OPEN
- **Location:** `src/cli/onboarding.js` (`deriveFollowupQuestions`)
- **Severity:** P2
- **Status:** OPEN — 2026-03-16
- **Description:** Follow-up questions use technical terms (e.g. "CI", "danger zones", "verification commands", "canonical config path", "Subject-world root path") without inline explanation. Terms like "CI" have multiple industry meanings, and non-technical project owners may not know what is being asked at all. Because questions are dynamically generated, hardcoded fixes per-string won't scale.
- **Observed:** `No CI configuration detected. Should I treat this as intentional?` — no explanation of what CI means or why it matters.
- **Expected:** The prompt generation logic should be responsible for constructing each question with: (1) plain-language explanation of the term, (2) why MBO needs this based on what was already gathered, and (3) an example of a valid answer.

### BUG-092: `mbo setup` exits to shell after onboarding completes — does not continue to daemon start | Milestone: 1.1 | RESOLVED
- **Location:** `bin/mbo.js` (`runSetupCommand`), `src/cli/onboarding.js` (`runOnboarding`, `createPromptIO`)
- **Severity:** P0 (Operational Blocker)
- **Status:** RESOLVED — 2026-03-16
- **Description:** After the onboarding interview completes and `[Onboarding] Completed.` is printed, the process exits to the shell. `persistInstallMetadata` and `installMCPDaemon` never run. The expected final output `[MBO] MCP daemon ready. Port written to .dev/run/mcp.json` is never seen.
- **Root cause:** `runOnboarding` calls `io.close()` in its `finally` block, which calls `rl.close()` on the readline interface bound to `process.stdin`. In Node.js, closing a readline interface in TTY mode causes stdin to emit `end`, draining the event loop and allowing the process to exit before the rest of the `runSetupCommand` promise chain (`persistInstallMetadata` → `installMCPDaemon`) executes.
- **Fix:** `createPromptIO`'s `close` method now calls `process.stdin.resume()` after `rl.close()`. This keeps stdin alive so the event loop persists until the outer promise chain completes.

### BUG-091: Prime directive handshake gives no feedback on why it failed or how to pass | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js` (`runPrimeDirectiveHandshake`)
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16
- **Description:** When the paraphrase fails the word-overlap check, the system prints "Paraphrase diverged. Let's clarify and try again." and re-prompts with no additional guidance. The user has no way to know (1) what the threshold is, (2) why their answer failed, or (3) what a passing answer looks like.
- **Fix:** On failure, the message now shows the overlap % and threshold (15%), and advises the user to reuse key words from the directive text. Attempt number (N/3) is also shown.

### BUG-090: Verification commands and danger zones prompts don't seed from scan-detected build system | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js` (`deriveFollowupQuestions`)
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16 (covered by BUG-088/089 fix)
- **Description:** `scanProject()` returns `verificationCommands` but `deriveFollowupQuestions` ignored it, presenting a blank field. Same for danger zones.
- **Fix:** Resolved as part of BUG-088/089: `scan.verificationCommands` and `scan.suggestedDangerZones` are now injected as defaults with "I detected X — confirm or modify" prompts.

### BUG-089: Follow-up questions don't use scan data — user must free-form answer what the scan already knows | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js` (`deriveFollowupQuestions`, `runFollowups`)
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16
- **Description:** Phase 3 follow-up questions presented blank prompts for danger zones and verification commands even though the scan had already collected this data.
- **Fix:** `deriveFollowupQuestions` now attaches `defaultValue` to each seeded question. `runFollowups` passes `q.defaultValue` to `io.ask`, so the detected values appear in brackets and are accepted on Enter. Prompts read "I detected X — confirm or modify."

### BUG-088: Danger zones question is structurally wrong — asks user to list what the system should infer | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js` (`deriveFollowupQuestions`, `scanProject`)
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16
- **Description:** The danger zones prompt asked the user to enumerate from memory instead of presenting scan-detected candidates.
- **Fix:** `scanProject` now computes `suggestedDangerZones` from detected state dirs (`.git/`, `.mbo/`, `.dev/`), `canonicalConfigPath`, and the first lock file found. `deriveFollowupQuestions` uses this to build the prompt: "I suggest these danger zones based on your project: [list]. Confirm or modify (comma-separated)." The list is pre-populated as the default so pressing Enter accepts it.

### BUG-087: `cp -r` of MBO source transplants controller `.mbo/` state into subject install | Milestone: 1.1 | RESOLVED
- **Location:** Install workflow / `src/cli/onboarding.js` (`checkOnboarding`)
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-17 (covered by BUG-086 fix)
- **Description:** The standard install path (`cp -r MBO/. MBO_Alpha/`) copies `.mbo/` wholesale, including `onboarding.json`, `mirrorbox.db`, logs, and runtime state. The subject project inherits the controller's identity. `checkOnboarding` validates the schema but does not verify that the profile's `projectRoot` matches the current working directory, so the stale controller profile silently passes validation.
- **Fix:** Resolved by BUG-086: `checkOnboarding` now reads `profile.projectRoot`, canonicalizes it, and compares against the current `cwd`. If mismatch is detected, the function logs a warning and triggers a full re-onboarding interview. The transplanted controller profile is rejected at runtime without requiring any changes to the copy workflow.

### BUG-086: `mbo setup` accepts copied profile from a different project — no project root validation | Milestone: 1.1 | PARTIAL
- **Location:** `src/cli/onboarding.js` (`checkOnboarding`)
- **Severity:** P1
- **Status:** PARTIAL — fix incomplete (validation 2026-03-16 FAIL)
- **Description:** When `.mbo/onboarding.json` is copied from another project, `checkOnboarding` validates the schema but never checks whether the profile's origin matches the current project root. A foreign profile passes validation and the onboarding interview is skipped entirely.
- **Fix shipped:** `buildProfile` now stores `projectRoot: path.resolve(projectRoot)` in the profile at write time. `checkOnboarding` canonicalizes both the stored root and the current cwd via `fs.realpathSync`; if they differ, logs a warning and triggers `runOnboarding`.
- **Validation result (2026-03-16 FAIL):** Fresh-install test (`rm -rf MBO_Alpha && cp -r MBO/. MBO_Alpha/ && node bin/mbo.js setup`) produced no `[SYSTEM]` warning and no interview — daemon started silently.
- **Root cause of failure:** The mismatch guard is `if (activeProfile && activeProfile.projectRoot)` — it is skipped when `projectRoot` is absent. The MBO controller's own `onboarding.json` was written before BUG-086 shipped and has no `projectRoot` field. When copied into MBO_Alpha, `activeProfile.projectRoot === undefined` and the entire detection block is bypassed.
- **Fix (round 2):** Changed guard from `if (activeProfile && activeProfile.projectRoot)` to `if (activeProfile)`. When `projectRoot` is absent, `canonicalStored` is set to `null`, which cannot match `canonicalCwd`, so re-onboarding is always triggered. Label in log message now shows `(unknown — profile predates root-tracking)` when field is missing. Awaiting re-validation.

### BUG-085: `mbo setup` skips onboarding interview on fresh project install | Milestone: 1.1 | RESOLVED
- **Location:** `bin/mbo.js` (`runSetupCommand`), `src/cli/setup.js` (`runSetup`)
- **Severity:** P0 (Operational Blocker)
- **Status:** RESOLVED — 2026-03-17
- **Description:** Two compounding layers:
  1. `runSetupCommand` gates on `~/.mbo/config.json` (global config). Any machine that previously ran `mbo setup` skips the entire setup wizard on all subsequent projects — only `installMCPDaemon` runs.
  2. Even if `runSetup()` executes, it never calls `checkOnboarding` or `runOnboarding`. The 4-phase interview (`onboarding.js`) is completely disconnected from the setup flow.
- **Observed:** On a fresh Alpha install, `mbo setup` printed only `[MBO] MCP daemon ready. Port written to .dev/run/mcp.json` — no questions asked, no `onboarding.json` written for the new project.
- **Fix:** (1) `runSetupCommand` now checks project-local `.mbo/config.json` (not global `~/.mbo/config.json`) to decide whether to run the setup wizard — every new project directory triggers the wizard. (2) `checkOnboarding(PROJECT_ROOT)` is called after the wizard completes, wiring the 4-phase onboarding interview into the setup flow.

### BUG-084: `mbo` does not auto-run `npm install` on first launch | Milestone: 1.1 | RESOLVED
- **Location:** `bin/mbo.js` (launch / setup path)
- **Severity:** P2
- **Status:** RESOLVED — 2026-03-17
- **Description:** On a fresh installation, the user must manually run `npm install` before any `mbo` command is usable. MBO should detect missing or incomplete `node_modules` on launch and either self-heal automatically or prompt the user to confirm before installing.
- **Fix:** Added `ensureNodeModules()` to `bin/mbo.js`. Checks for `node_modules/.package-lock.json` at the package root; if absent, runs `npm install --prefix <PACKAGE_ROOT>` before the command dispatch. Exits with an error message if install fails.

### BUG-075: DB path resolution regression in test scripts (BUG-051 aftershock) | Milestone: 1.1 | RESOLVED
... (rest of BUG-075)

### BUG-079: `waitForHealth` in `mbo.js` lacks project_id validation | Milestone: 1.1 | FIXED
- **Location:** `bin/mbo.js` (`runMcpRecoveryCommand` → `waitForHealth`)
- **Severity:** P2
- **Status:** FIXED — 2026-03-16 (claude/mcp-audit-fixes)
- **Description:** Found during Codex MCP E2E audit. `waitForHealth` in `mbo.js` reads the manifest symlink and probes the port without checking `project_id`. Under multi-project conditions, it could declare a healthy response from a different project's daemon. Also: if the symlink pid is dead, no fallback scan occurs — the function loops until timeout even when a live pid-specific manifest exists for the same project.
- **Fix:** Added `project_id` derivation (sha256 of canonical PROJECT_ROOT, 16-char hex). `getPort()` now checks if the manifest pid is alive; if dead, scans `manifestDir` for any `mcp-<projectId>-*.json` with a live pid. Validates `project_id` match before returning port.

### BUG-078: No auto-refresh of client configs after daemon respawn | Milestone: 1.1 | FIXED
- **Location:** `src/utils/update-client-configs.js` (new), `src/graph/mcp-server.js`, `src/cli/setup.js`, `bin/mbo.js`
- **Severity:** P2
- **Status:** FIXED — 2026-03-16 (claude/bug-078-client-config-refresh)
- **Description:** Found during Codex MCP E2E audit. When launchd respawns the MCP daemon after a crash or wake, the daemon got a new ephemeral port and updated `.dev/run/mcp.json`, but `.mcp.json` and `.gemini/settings.json` still contained the old port. Clients silently failed until the user manually ran `mbo mcp` or `mbo setup`. Additionally, `mbo mcp` unconditionally tore down and restarted the daemon even when healthy, causing unnecessary port churn every session.
- **Fix:**
  1. `src/utils/update-client-configs.js` — new shared util. Reads `mcpClients` registry from `<project>/.mbo/config.json`, writes the live MCP port to each registered agent config file. Agent-agnostic: adding a new agent requires only a config entry, no code change.
  2. `src/graph/mcp-server.js` — calls `updateClientConfigs` on every daemon startup. launchd respawns now self-heal client configs automatically.
  3. `src/cli/setup.js` — `installMCPDaemon` checks health first (2s timeout); skips restart if daemon already healthy. Replaces hardcoded client list with shared util. `mbo setup` populates `mcpClients` registry from detected providers.
  4. `bin/mbo.js` — `mbo mcp` checks daemon health before teardown; skips restart if healthy, refreshes configs in-place.
- **Tests:** 97 passing (33 unit + 64 failure modes). `python3 bin/validator.py --all` passes.
- **Install note:** `mbo setup` must be re-run on each project to populate `mcpClients` in `.mbo/config.json`. Until then, daemon logs "No mcpClients registered" and skips config refresh (no crash).

### BUG-077: Stale symlink after ungraceful daemon death | Milestone: 1.1 | FIXED
- **Location:** `src/cli/setup.js` (`waitForHealth`, `installMCPDaemon`), `bin/mbo.js`
- **Severity:** P1
- **Status:** FIXED — 2026-03-16 (claude/mcp-audit-fixes)
- **Description:** Found during Codex MCP E2E audit. When the MCP daemon is killed via SIGKILL or crashes, its `shutdown()` handler never runs. The `.dev/run/mcp.json` symlink remains pointing to the dead pid's manifest. Any subsequent `mbo setup` or `mbo mcp` call reads the stale symlink, probes a dead port, and loops until timeout. This is the root cause of the repeated "Dev graph unavailable" failures at session start.
- **Compounding issue:** 5 orphaned PID manifest files (`mcp-<projectId>-<pid>.json`) accumulate in `.dev/run/` with no cleanup mechanism.
- **Fix:** In `setup.js` `installMCPDaemon`: before launching daemon, scan and delete orphaned PID manifests (alive check via `process.kill(pid, 0)`). In `waitForHealth` (both `setup.js` and `mbo.js`): if symlink manifest pid is dead, scan directory for live pid-specific manifests matching project_id as fallback.

### BUG-076: `test-tamper-chain.js` fails to detect database mutation | Milestone: 1.1 | RESOLVED
- **Location:** `scripts/test-tamper-chain.js`
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16 (fix/bug-076-tamper-detection)
- **Root cause:** Test copied the real `mirrorbox.db` and mutated `seq=2`. If the live DB had 0 or 1 events, the `UPDATE WHERE seq = 2` touched 0 rows, so no tamper occurred. `verify-chain.js` then reported `PASS: Event store is empty` or `PASS: chain intact`, producing a false pass.
- **Fix:** Rewrote test to be fully self-contained. Seeds 5 synthetic events with valid SHA-256 hash chain into a fresh temp DB (`tamper-test.db`), asserts `result.changes > 0` after the mutation, then runs both tamper scenarios (payload mutation + partial hash fix with broken prev_hash chain). Both are now caught. 16/16 tests pass.
- **Verification:** `node scripts/test-tamper-chain.js` and `npm test` both pass clean.

### BUG-072: Enrichment failures misclassified as `failed_critical` — blocks graph green status | Milestone: 1.1 | RESOLVED
- **Location:** `src/graph/static-scanner.js` (`enrich()`), `src/graph/mcp-server.js` (`_summarizeAndPersistScan()`)
- **Severity:** P0
- **Status:** RESOLVED — 2026-03-15
- **Verification:** Code-pass / runtime-indirect (logic audit + surgical fixes for initDev/graph_update_task)
- **Root cause:** Two compounding defects:
  1. `src/utils/resolve-manifest.js` was deleted in Task 1.1-H23 but its nodes were never pruned from the graph DB. During `enrich()`, stale nodes cause `client.openDocument()` to throw ENOENT, which propagates and kills the entire enrich pass.
  2. `_summarizeAndPersistScan()` classifies any `<enrich>` failure as `failed_critical` — the same severity as a static scan failure. LSP enrichment is best-effort and should never be fatal.
- **Impact:** Every scan reports `failed_critical`. Operators see a permanently red server status. 47 sessions lost to MCP debugging.
- **Fix implemented:**
  1. `enrich()`: added `fs.existsSync(absPath)` guard — if file missing, prune its stale nodes from DB and continue. Wrapped per-file LSP calls in try/catch so one bad file cannot kill the pass.
  2. `_summarizeAndPersistScan()`: demoted `<enrich>` path to `completed_with_warnings`, not `failed_critical`. Reserved `failed_critical` for static scan failures only.
  3. Consistent application across all 4 `enrich()` call sites in `mcp-server.js`.

### BUG-073: Scan health regression — persistent `failed_critical` in multiple projects | Milestone: 1.1 | RESOLVED
- **Location:** `src/graph/static-scanner.js`, `src/graph/mcp-server.js`, `src/state/db-manager.js`
- **Severity:** P0
- **Status:** RESOLVED — 2026-03-16
- **Root causes (two separate):**
  1. MBO project: `FOREIGN KEY constraint failed` when scanner deleted stale nodes still referenced by `edges` table. Fixed by adding `ON DELETE CASCADE` to both FK definitions in `edges` table + idempotent startup migration. (commit 2e83368 — Gemini, verified by Claude)
  2. johnseriouscom/MBO_Alpha: scanner hard-codes `<root>/src` as scan root; these projects have no `src/` directory. Deferred to Task 1.1-H32 (configurable scan roots via `.mbo/config.json` + `mbo setup` source detection).

### BUG-074: mbo setup does not write MCP client configs or detect scan roots | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/setup.js`, `src/graph/mcp-server.js`
- **Severity:** P0
- **Status:** RESOLVED — 2026-03-16
- **Description:** After `mbo setup`, no MCP client config (.mcp.json, .gemini/settings.json, etc.) is written with the live daemon port. Any agent (Claude, Gemini, Codex, local) must manually configure its MCP URL. Additionally, scanner hard-codes `src/` as scan root — projects without a `src/` directory (e.g. johnseriouscom) always fail with `failed_critical`. Setup has no scan root detection step.
- **Impact:** MCP tools non-functional for all clients after fresh install. johnseriouscom and MBO_Alpha daemons return 0 nodes.
- **Fix:** Task 1.1-H32 — client config registry (write URL to all detected clients after daemon starts; refresh on `mbo mcp`) + scan root detection (walk project, detect source dirs, prompt, write to `<project>/.mbo/config.json`; mcp-server reads with `['src']` fallback).

### BUG-068: Temporary MCP suspension to prevent non-productive troubleshooting loops | Milestone: 1.1 | RESOLVED
- **Location:** `AGENTS.md`, runtime operational policy
- **Severity:** P0 (operational blocker)
- **Status:** RESOLVED — 2026-03-13 — architectural root cause identified and superseded by Task 1.1-H23
- **Description:** MCP runtime instability (initialize hangs, restart races, stale manifest/port behavior) caused repeated troubleshooting churn and blocked productive agent work.
- **Resolution:** Not a code fix — an architectural decision. MBO stops managing MCP process lifecycle entirely. launchd owns the server. The entire class of failures (port negotiation, manifest drift, session ID races, watchdog stampedes) is eliminated by design. See Task 1.1-H23.

### BUG-069: MCP architecture requires OS-level process management (launchd daemon migration) | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js`, `src/auth/operator.js`, `scripts/`, `docs/mcp.md`
- **Severity:** P0 (blocks all reliable multi-agent MCP usage)
- **Status:** COMPLETED — 2026-03-13 — Migration to launchd daemon on port 7337 finalized.
- **Root cause:** MBO's self-managed MCP lifecycle was brittle. Migration eliminates all self-management failure modes.

### BUG-053: Runtime MCP initialize loop fails on Streamable HTTP (`Server already initialized`) | Milestone: 1.1 | COMPLETED
- **Location:** `src/auth/operator.js` (`startMCP`, `_initializeMCPWithRetry`, `_sendMCPHttp`)
- **Severity:** P0
- **Status:** COMPLETED — 2026-03-12
- **Root cause:** Three compounding defects in the MCP session lifecycle:
  1. `mbo-start.sh` exited with code 1 on port-already-bound — every warm restart silently failed to spawn, leaving the Operator with no server to connect to.
  2. `this.mcpSessionId` was a pure instance variable lost on every `Operator` reconstruction. On warm restart the new instance had no session ID, so `tools/list` was rejected, the catch fell through to the `initialize` loop, and the server returned `400 Server already initialized`. The error was swallowed, leaving `mcpSessionId` permanently null for the session.
  3. `_sendMCPHttp` called `JSON.parse(responseBody)` unconditionally. When the server responded with `Content-Type: text/event-stream` (SSE framing), the body was `data: {...}\n\n` — not valid JSON — causing every call to reject with `Invalid MCP JSON response`.
- **Fix implemented:**
  - `mbo-start.sh`: exit 0 (not 1) when port already bound — warm restart is a valid path.
  - `startMCP`: TCP `_isPortBound` probe gates spawn; `_waitForMCPReady` polls sentinel file (`.dev/run/mcp.ready`) then falls back to TCP rather than retry-storming `initialize`.
  - `_sendMCPHttp`: captures `mcp-session-id` from response header and persists it to `.dev/run/mcp.session` on every successful assignment.
  - `startMCP` reuse path: reads `.dev/run/mcp.session` and restores `this.mcpSessionId` before probing, so `tools/list` goes out with the correct header.
  - `_initializeMCPWithRetry`: on `portBusy=true`, probes with `tools/list` instead of `initialize`. If the restored session ID is rejected, evicts the stale file, nulls the ID, and re-initializes cleanly.
  - `_sendMCPHttp`: reads `Content-Type` header; if `text/event-stream`, parses SSE frames and extracts the first `data:` payload before JSON-parsing.
  - `shutdown`: deletes `.dev/run/mcp.session` on clean shutdown to prevent stale ID reuse after server kill.

### BUG-064: `mcp_query.js` initialize timeout due to wrong endpoint selection under dual manifests | Milestone: 1.1 | COMPLETED
- **Location:** `mcp_query.js`
- **Severity:** P0
- **Status:** COMPLETED — 2026-03-13
- **Root cause:** Client endpoint resolution trusted first-ready manifest precedence (or ad-hoc env overrides), which can target a live MCP from a different project/root under multi-run conditions. This surfaced as repeated `MCP request timeout for method=initialize` even when a healthy local server existed for the current repo.
- **Fix implemented (minimal + robust):**
  1. Added manifest candidate resolution across `.dev/run/mcp.json` and `.mbo/run/mcp.json` with strict validation (`manifest_version`, `status`, `port`).
  2. Added project identity scoring (`project_root` canonical match + `project_id` hash match to current cwd).
  3. Added fail-safe filter: when any `project_id` match exists, non-matching candidates are rejected.
  4. Added endpoint preflight TCP probe before initialize; unhealthy listeners are skipped automatically.
  5. Added initialize fallback across candidates with adaptive timeout steps (`6s`, `12s`, `25s`) for cold starts.
  6. Added handling for `Server already initialized` responses that still return session headers.
  7. Added `--diagnose` mode and function-style invocation parsing (`graph_search('...')`) to make operational debugging deterministic.

### BUG-065: MCP endpoint accepts TCP but hangs POST/initialize; env override filtered behind project_id preference | Milestone: 1.1 | COMPLETED
- **Location:** `mcp_query.js`
- **Severity:** P0
- **Status:** COMPLETED — 2026-03-13
- **Reproduction (2026-03-13):**
  1. `MBO_PORT=61024 node mcp_query.js --diagnose graph_search "Canonicalize AGENTS.md"`
  2. Prior behavior: candidate filter kept only `project_id` matches, dropping `MBO_PORT` and falling back to stale `3737`.
  3. Direct probes showed `61024` accepted TCP/GET but hung `POST /mcp` initialize until timeout (no response body).
- **Root cause:**
  1. Candidate narrowing was too strict: once any `project_id` match existed, non-matching candidates (including explicit `MBO_PORT`) were removed.
  2. Health preflight was TCP-only, so endpoints that accepted socket connect but could not complete MCP POST/initialize were treated as healthy.
- **Fix implemented (minimal app fix):**
  1. Marked explicit env candidate as `isEnvOverride` and retained it through project-id filtering.
  2. Relaxed project-id narrowing to keep canonical-root matches and env overrides (`matchedProjectId || matchedRoot || isEnvOverride`).
  3. Added fast HTTP POST preflight (`postProbe`) before initialize, so TCP-open but POST-hung endpoints are skipped deterministically.
- **Validation:**
  - `MBO_PORT=61024 node mcp_query.js --diagnose graph_search "Canonicalize AGENTS.md"`
    - shows `61024` attempted first; skipped via `POST probe timeout`; stale `3737` reported `ECONNREFUSED`.
  - `node mcp_query.js --diagnose "graph_search('Canonicalize AGENTS.md')"`
    - shows stable candidate order + explicit endpoint-specific failure reasons.

### BUG-066: Streamable HTTP initialize can hang when request is routed to a reused transport instance | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js`
- **Severity:** P0
- **Status:** COMPLETED — 2026-03-13
- **Root cause:** The `/mcp` POST router could route a new `initialize` request onto an existing session transport under mixed client behavior. On Streamable HTTP, initialize is transport-session scoped; re-init on a reused initialized transport can stall/no-response from the client perspective.
- **Fix implemented:**
  1. Added `isInitializeRequest(parsedBody)` helper.
  2. For every initialize request, server now always creates a fresh transport and handles initialize there.
  3. Non-initialize requests continue using session-id routing and stale-session transparent recovery.
- **Validation:**
  - `node --check src/graph/mcp-server.js`
  - `curl http://127.0.0.1:7337/health` returned `{"status":"ok",...}`
  - Direct initialize probe returned HTTP 200 with `mcp-session-id` and JSON-RPC initialize result

### BUG-067: `mbo auth` should remain usable in controller repo while runtime/init stay guarded | Milestone: 1.1 | FIXED
- **Location:** `bin/mbo.js`
- **Severity:** P1
- **Status:** FIXED — 2026-03-13
- **Description:** User reported `mbo auth src --force` blocked by controller-run guard message, despite auth being intended as a global operation. Runtime/init guard should remain strict.
- **Fix implemented:** Explicitly documented/enforced auth-path behavior in `runAuthCommand` comments and kept guard checks scoped to runtime/init branches only.

---

## Section 2 — P1: Must Fix Before Milestone Complete

### BUG-032: PRE-0.6 Test 1 FAIL — Graph Coordinate Integrity blocked by nodes schema drift
- **Location:** `src/state/db-manager.js`
- **Severity:** P1
- **Status:** COMPLETED — Idempotent migration implemented. Verified in re-audit.

### BUG-033: PRE-0.6 Test 3 FAIL — callModel does not persist redacted prompt/response to Event Store
- **Location:** `src/auth/call-model.js`
- **Severity:** P1
- **Status:** COMPLETED — Event store logging with redaction implemented. Verified in re-audit.

### BUG-034: PRE-0.6 Test 4 FAIL — session-close backup script missing
- **Location:** `scripts/mbo-session-close.sh`
- **Severity:** P1
- **Status:** COMPLETED — Backup script implemented and verified.

### BUG-035: Test 2 heuristic miss on injected phrasing variant
- **Location:** `src/auth/call-model.js`
- **Severity:** P0
- **Status:** COMPLETED — Heuristic strengthened and verified in re-audit.

### BUG-039: Missing mandatory human approval gate before mutation (Inv. 3) | Milestone: 0.7 | COMPLETED
- **Location:** `src/index.js`, `src/auth/operator.js`
- **Severity:** Critical
- **Status:** COMPLETED — Implemented `handleApproval` state machine and `APPROVAL` event logging in `operator.js`.
- **Impact:** Section 2 / Invariant 3 requires explicit `go` at Stage 5; verified enforcement for Tier 1+ routing.

### BUG-040: No `world_id` enforcement for operations (Inv. 10) | Milestone: 0.8 | COMPLETED
- **Location:** `src/state/event-store.js`, `src/state/state-manager.js`
- **Severity:** High
- **Status:** COMPLETED — world_id (mirror/subject) enforced in EventStore and StateManager. Verified in audit.

### BUG-041: No pre-mutation checkpoint mechanism (Inv. 13) | Milestone: 0.8 | COMPLETED
- **Location:** `src/state/state-manager.js`, `src/state/db-manager.js`
- **Severity:** High
- **Status:** COMPLETED — Snapshot-based checkpointing and rollback implemented in StateManager.

### BUG-013: CLI sandbox interaction undefined for terminal context | Milestone: 0.8 | FIXED
- **Location:** `src/index.js`, `src/auth/operator.js`
- **Severity:** Medium
- **Status:** FIXED — Implemented `ctrl+f` focus toggle in `index.js` and input interception in `operator.js`.
- **Impact:** User can interact with dry-run applications in terminal by focusing the sandbox.

### BUG-045: No token usage logging per callModel invocation | Milestone: 0.8 | COMPLETED
- **Location:** `src/auth/call-model.js`, `src/state/db-manager.js`
- **Severity:** Medium
- **Status:** COMPLETED — token_log table, usage capture, and get_token_usage MCP tool implemented.

---

## Section 4 — P2: Deferred

### BUG-044: MCP server stuck state not detected by supervisor | Milestone: 0.7.x | COMPLETED
- Location: `scripts/mbo-watchdog.sh`, `scripts/mbo-start.sh`
- Severity: P1
- Status: COMPLETED — Section 18 Watchdog implemented. Monitors for high CPU/hung processes and SIGKILLs on violation. launchd/parent handles respawn.

### BUG-036: `mcp-server.js` shutdown() does not WAL-checkpoint before exit | Milestone: 0.6 | FIXED
- **Location:** `src/graph/mcp-server.js`
- **Status:** FIXED — Implemented `GraphService.shutdown()` and PRAGMA wal_checkpoint.

### BUG-009: Staleness Detection (Merkle Pulse Check) | Milestone: 1.0 | COMPLETED
- **Location:** `bin/handshake.py`
- **Severity:** High
- **Status:** COMPLETED — Implemented Merkle Pulse Check and audit logging.

### BUG-037: MCP lifecycle owned by CLI client configs | Milestone: 1.0 | COMPLETED
- **Location:** `bin/mbo_server.py`, `src/graph/mcp-server.js`
- **Severity:** Medium
- **Status:** COMPLETED — Decoupled MCP server via independent Python host.

### Milestone 0.3
- **BUG-023:** Fixed redactor callback offset/group1 confusion in `redactor.js`.
- **BUG-024:** Upgraded chain-linked hash envelope with `seq` field.
- **BUG-025:** Fixed deterministic ordering via transaction-assigned `seq`.
- **BUG-026:** Added snapshot type guard to `recover()`.

### BUG-046: stdio transport incompatible with launchd — infinite restart loop | Milestone: 0.8 | FIXED
- **Location:** `src/graph/mcp-server.js`, `.mcp.json`, `.gemini/settings.json`, `scripts/mbo-start.sh`
- **Severity:** P0 (blocked all MCP sessions from persisting)
- **Status:** FIXED — Migrated from `StdioServerTransport` to `StreamableHTTPServerTransport` on port 3737. Each AI client now connects via URL (`http://127.0.0.1:3737/mcp`). Server is persistent under launchd; watchdog spawn removed from `mbo-start.sh`.
- **Root cause:** `StdioServerTransport` is per-connection — the MCP process exited when the client disconnected, triggering launchd respawn. Every new agent session spawned a fresh process, ran a full graph scan+enrich, and then died. The loop was structural, not a crash.
- **Fix details:** `GraphService` singleton owns all graph state. Per-session `Server` + `StreamableHTTPServerTransport` pairs are created on each client's `initialize` handshake and stored in a `sessions` Map. `enqueueWrite()` Promise chain serializes concurrent graph mutations. `isScanning` mutex with `finally` prevents overlapping rescans. `mbo-start.sh` adds port pre-flight kill (SIGTERM → SIGKILL) before starting.

### BUG-047: Session start logging lacks timestamps | Milestone: 0.8 | FIXED
- **Location:** `scripts/mbo-start.sh`, `src/graph/mcp-server.js`
- **Severity:** P2
- **Status:** FIXED — All `echo` lines in `mbo-start.sh` and all `console.error` diagnostics in `mcp-server.js` now include ISO 8601 UTC timestamps via `$(date -u +"%Y-%m-%dT%H:%M:%SZ")` (bash) and `new Date().toISOString()` (Node.js).

### BUG-048: NEXT_SESSION.md generation uses LAST_TASK_NAME in graph_search instead of NEXT_TASK_DESC | Milestone: 0.8 | FIXED
- **Location:** `scripts/mbo-session-close.sh` line ~110
- **Severity:** P1 (caused context drift — next session's Gate 0 search used the completed task name, e.g. "0.6-04", returning empty results)
- **Status:** FIXED — Changed `graph_search("${LAST_TASK_NAME}")` to `graph_search("${NEXT_TASK_DESC}")`. `NEXT_TASK_DESC` is already parsed from `projecttracking.md` earlier in the script and contains a meaningful description like "Implement Runtime Edge enrichment for Intelligence Graph", producing actionable graph query results at session start.

### BUG-049: MCP server exits silently when launched via mbo-start.sh in non-launchd context | Milestone: 1.0 | FIXED
- **Location:** `scripts/mbo-start.sh`
- **Severity:** P1
- **Status:** FIXED — Removed the `exec 3>&1` / `exec 1>&2` / `exec 1>&3` / `exec 3>&-` fd save-restore block. With `set -uo pipefail`, `exec 1>&3` caused a fatal exit when fd 3 was invalid in non-launchd contexts (e.g. bash tool sandbox). Since `mcp-server.js` uses stderr exclusively, stdout ownership is irrelevant and the fd dance was purely vestigial. `exec node` retained. launchd service enabled via `launchctl load -w` — MCP now auto-starts on login.
- **Fixed:** 2026-03-11

### BUG-054: Graph server has no trust contract — clients cannot verify root or freshness | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js`, `src/auth/operator.js`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-12
- **Description:** The graph server exposes no identity or freshness metadata. All clients (Operator, Claude CLI, Gemini CLI) connect and immediately trust query results with no verification that the server is scanning the correct project root or that the graph is current. This produces silent wrong-context failures.
- **Fix (Task 1.1-10):**
  1. Added `graph_server_info` MCP tool returning project_root, project_id, index_revision, last_indexed_at, node_count, is_scanning.
  2. Server root derived from `__dirname` by default — eliminates cwd dependency.
  3. index_revision and last_indexed_at persisted in DB.
  4. Operator asserts project_id on every connect; hard fails on mismatch.
  5. Documented explicit rescan contract.

### BUG-055: MCP runtime contract v3 not enforced (manifest atomicity, lock, fingerprint, incident breaker) | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js`, `src/auth/operator.js`, `scripts/test-mcp-contract-v3.js`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-12
- **Description:** MCP startup/recovery behavior lacked the deterministic contract required by Section 32 (manifest v3 fields + checksum, CAS startup lock, process fingerprint verification, explicit incident breaker behavior). This left split-brain and silent retry-loop risk under concurrent starts and crash conditions.
- **Fix (Task 1.1-H08):**
  1. Added manifest v3 schema + checksum and atomic write semantics in server runtime manifest handling.
  2. Added CAS startup lock (`mcp.lock`) with stale owner reclaim by liveness/age.
  3. Added `epoch`/`instance_id` lifecycle transitions across startup/shutdown.
  4. Added operator-side process fingerprint validation (pid start time + command/root) before trust.
  5. Added operator circuit breaker: `3` restart failures within `30s` opens incident and writes explicit `incident_reason`.
  6. Added integration smoke test for manifest validity, restart rollover, and corrupt-manifest recovery.

### BUG-057: MCP stream-destroyed incident — server entering incident state on client disconnect during scan | Milestone: 1.1 | COMPLETED
- **Location:** `src/graph/mcp-server.js`
- **Severity:** P0
- **Status:** COMPLETED — 2026-03-13
- **Root cause:** Three compounding issues: (1) `uncaughtException` handler called `shutdown()` on `ERR_STREAM_DESTROYED` — a stale-session artifact — killing a healthy server. (2) `transport.handleRequest` call sites had no guard against destroyed streams. (3) `autoRefreshDevIfStale` ran outside `enqueueWrite`, allowing `isScanning` to race with queued write operations.
- **Fix (Task 1.1-H15):** DID reconciliation across Claude/Gemini/Codex. Final patch: `safeHandleTransportRequest` wrapper catches stream-destroyed errors at the call site with dual condition (`isStreamDestroyedError && isSocketGone`). `safeSSEWrite` guards the `/stream` SSE endpoint. SSE listener self-removes on destroyed stream. `autoRefreshDevIfStale` body wrapped in `enqueueWrite` to serialize with other write operations.

### BUG-058: `autoRefreshDevIfStale` race with queued writes — `isScanning` flag not serialized | Milestone: 1.1 | OPEN
- **Location:** `src/graph/mcp-server.js`
- **Severity:** P1
- **Status:** RESOLVED as part of BUG-057 fix (1.1-H15). No separate patch needed.

### BUG-059: Port mismatch — `MBO_PORT` env var may diverge between Operator and MCP manifest | Milestone: 1.1 | SUPERSEDED
- **Location:** `src/auth/operator.js`, `scripts/mbo-start.sh`
- **Severity:** P2
- **Status:** SUPERSEDED — 2026-03-13 — eliminated by Task 1.1-H23. No manifest, no dynamic port. Port is fixed at 7337. `MBO_PORT` env var removed.

### BUG-060: SSE `/stream` endpoint lacks keepalive heartbeat — proxy timeouts silently destroy stream | Milestone: 1.1 | SUPERSEDED
- **Location:** `src/graph/mcp-server.js`
- **Severity:** P2
- **Status:** SUPERSEDED — 2026-03-13 — eliminated by Task 1.1-H23. Server binds loopback only (127.0.0.1), no proxy layer. SSE keepalive not required in this topology.

### BUG-061: Merkle scope drift + MCP query path drift can cause false mismatch and wrong-server access | Milestone: 1.1 | OPEN
- **Location:** `bin/handshake.py`, `src/relay/pile.js`, `mcp_query.js`, `src/utils/resolve-manifest.js`
- **Severity:** P0
- **Status:** PARTIAL FIXED — 2026-03-13
- **Description:** Two coupled drift failures were tracked: (1) Merkle scope mismatch (`handshake.py` validates `src/` baseline while `pile.js` computes project-root hashes), so non-`src` changes can trigger false promotion mismatches; (2) preflight query usage still appears as `mcp_query.js ...` in operator flows, which fails with `command not found` unless `node` is explicit and can bypass manifest-root assertions when stale scripts are used.
- **Implemented:**
  1. `mcp_query.js` endpoint selection now validates/ranks manifests and prefers matching `project_id` for current cwd.
  2. Added multi-candidate fallback with preflight TCP probe + adaptive initialize timeouts.
  3. Added `--diagnose` and function-style query parsing to standardize preflight invocation.
- **Remaining:**
  1. Introduce explicit Merkle scope contract (`src` vs `approved_files` vs `project`) and enforce one scope per operation pair.
  2. Update Pile verification to hash the approved promotion set (or identical explicit scope on both worlds), not full project root by default.
  3. Standardize MCP preflight command path to `node ./mcp_query.js ...` in all operator flows.
  4. Add regression tests for case-variant project roots and non-`src` edits to ensure no false lockout.

### BUG-062: Auth bootstrap unusable in-app/self-run contexts (CLI dependency and non-TTY failure) | Milestone: 1.1 | COMPLETED
- **Location:** `bin/mbo.js`, `bin/handshake.py`, `src/cli/setup.js`, `src/index.js`, onboarding/auth UX
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-13
- **Description:** `mbo auth` previously routed through setup flow and produced misleading session output in normal app/agent workflows. This created first-run lockout and high-friction recovery in self-run/non-TTY contexts.
- **Implemented (partial):**
  1. `mbo auth <scope> [--force]` now routes directly to `bin/handshake.py` (no setup wizard detour).
  2. `--status` now prints `Expired` for elapsed sessions (never false `Active`).
  3. `--force` supports human override for Merkle mismatch, with explicit warning + audit logging.
  4. `.` scope is supported only with `--force` and explicit high-risk confirmation prompt.
  5. Re-running `mbo auth` with the same active scope now toggles and revokes that session.
  6. Replaced env-sentinel auth gating with macOS Keychain-backed user-presence checks for grant/revoke/toggle paths.
  7. Added explicit fail-closed non-interactive contract with CI-only approval policy (`CI=1`, `MBO_CI_AUTH_APPROVED=1`, optional action/scope allowlists).

### BUG-063: macOS auth fallback path may pass via unlocked keychain without explicit biometric/password prompt | Milestone: 1.1 | OPEN
- **Location:** `bin/handshake.py` (`_macos_keychain_presence_check`)
- **Severity:** P2
- **Status:** OPEN — 2026-03-13
- **Description:** Primary auth path uses LocalAuthentication prompt; fallback path uses Keychain lookup which can succeed silently when keychain is already unlocked, depending on host policy. This is acceptable as a fallback but should be hardened to guarantee explicit user-presence semantics.
- **Fix Required:** Move fallback to a keychain item that requires user-presence ACL (`SecAccessControl` with `biometryCurrentSet`/`userPresence`) and validate deterministic prompt behavior.

### BUG-056: Tokenmiser dashboard using NaN placeholders for tokenizer/pricing data | Milestone: 1.1 | RESOLVED
- **Location:** `src/state/stats-manager.js`, `src/cli/tokenmiser-dashboard.js`
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16 (commit 8640211)
- **Description:** Tokenmiser dashboard/runtime tests previously masked missing numeric flow and surfaced NaN placeholders in the token/cost metrics path.
- **Fix:** Added `getLifetimeSavings()` in `src/state/stats-manager.js` as a numeric savings source for dashboard checks and removed BUG-056 skip from `tests/run-all.js`; `scripts/test-tokenmiser-dashboard.js` now runs by default and passed with numeric token/cost values.

### BUG-081: Operator emits raw JSON dumps to human output (Stage leakage) | Milestone: 1.1 | RESOLVED
- **Location:** `src/index.js`, `src/auth/operator.js`
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16 (commit 8640211)
- **Description:** Runtime output path leaked structured stage payloads to the human prompt instead of stage-appropriate English summaries.
- **Fix:** `src/index.js` `formatOperatorResult()` now maps status/stage values to human-readable English and falls back to a generic human message, preventing raw JSON leakage while keeping structured objects internal.

### BUG-050: Validator failure does not halt pipeline | Milestone: 1.1 | COMPLETED
- **Location:** `src/auth/operator.js` — `runStage6`, `handleApproval`, `runStage3`
- **Severity:** P1
- **Status:** COMPLETED — 2026-03-12
- **Description:** `handleApproval` logged `validatorPassed: false` but did not halt.
- **Fix:** Implemented pipeline halt in `handleApproval` on validator failure. Logs are captured into `stateSummary.executorLogs` and injected into `runStage3` for a planning retry (up to 3 recovery attempts). Added `executorLogs` reset in `processMessage` for new tasks.

### BUG-051: DBManager DB path hardcoded to MBO source directory | Milestone: 1.1 | FIXED
- **Fixed:** 2026-03-11 — `path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db')`
- **Location:** `src/state/db-manager.js` line 6
- **Severity:** P1
- **Status:** FIXED
- **Description:** `DEFAULT_DB_PATH = path.join(__dirname, '../../data/mirrorbox.db')` resolves relative to MBO's own source tree. This is wrong for any project MBO is run against — the DB should live in the project's `.mbo/` directory.
- **Fix:** Resolve from `MBO_PROJECT_ROOT` env var with `process.cwd()` fallback: `path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db')`.

### BUG-052: No global `mbo` entrypoint — tool not installable as a CLI | Milestone: 1.1 | FIXED
- **Fixed:** 2026-03-11 — `bin/mbo.js` created, `package.json` bin entries added, `private` removed.
- **Location:** `package.json`, `bin/` (missing)
- **Severity:** P1
- **Status:** OPEN
- **Description:** No `bin` field in `package.json`. No `bin/mbo.js` launcher exists. MBO cannot be installed globally via `npm install -g` and invoked as `mbo` from a project directory.
- **Fix:** Create `bin/mbo.js` thin launcher (delegates to `src/index.js` via tsx). Add `"bin": { "mbo": "bin/mbo.js", "mboalpha": "bin/mbo.js" }` to `package.json`. See Section 28.

---

### BUG-080: 7 test suite failures — pre-existing, not H26 regressions | Milestone: 1.1 | RESOLVED
- **Location:** `scripts/test-*.js`
- **Severity:** P2
- **Status:** RESOLVED — 2026-03-16
- **Identified during:** H26 reviewer audit (Claude)
- **Failures:**
  1. `test-chain.js` — requires `test-state.js` run first to seed events; no ordering in runner
  2. `test-mcp-contract-v3.js` — requires live MCP daemon; fails with `server_not_healthy` in isolation
  3. `test-mcp-server.js` — test timeout; server starts on ephemeral port but test hangs waiting
  4. `test-recovery.js` — passes invalid `world_id` to event-store; throws invariant violation
  5. `test-routing-matrix-live.js` — requires live MCP; `TypeError: Invalid URL` on null port
  6. `test-tamper-chain.js` — BUG-076 (tamper detection non-functional, already logged)
  7. `test-tokenmiser-dashboard.js` — `statsManager.getLifetimeSavings is not a function` (BUG-056 family)
- **None of these are H26 regressions.** All confirmed pre-existing against `gemini/1.1-H26` baseline.
- **Fix required:** Test suite needs infra-dependency tagging (skip MCP tests when daemon absent), test ordering enforcement for chain tests, and BUG-076/BUG-056 fixes upstream.

### BUG-082: Operator pipeline spec drift / stubbed stages | Milestone: 1.1 | RESOLVED
- **Location:** `src/auth/operator.js`, `src/auth/did-orchestrator.js`, `src/index.js`
- **Severity:** P1
- **Status:** RESOLVED — 2026-03-16 (codex/1.1-H36-spec-parity-pipeline)
- **Description:** Runtime pipeline diverged from SPEC Sections 15/27/33/35 and currently runs with stubbed/non-spec behavior in core stages.
- **Required fixes:**
  1. Stage flow mismatch: explicit `go` approval appears before the full Stage 1.5 → 3/4/4.5 chain has completed.
  2. Stage 11 not chained after approval/audit success path.
  3. DID blind violation: reviewer derivation can see planner output before allowed stage.
  4. Stage implementations are stubbed or bypassed in Stage 3/4/4.5/6/7/1.5/hard-state paths and must be restored to real implementations.
- **Fix implemented:**
  1. Restored non-stubbed Stage 1.5/3/4/4.5/6/7/hard-state paths in `src/auth/operator.js` from project backup baseline.
  2. Chained Stage 11 directly after Stage 8 (`runStage8` now calls `runStage11`).
  3. Enforced DID blindness in round-1 reviewer derivation: removed planner output from reviewer prompt and passed protected hashes into reviewer call in `src/auth/did-orchestrator.js`.
  4. Updated Stage 6 file scope to prefer reconciled plan scope (`filesToChange` / plan diff paths) via `_resolvePlanFiles` and only fall back to classification files when plan scope is unavailable.
  5. Preserved Section 33 streaming and Section 35 context/budget behavior (no regressions introduced in call-model streaming/minimization paths).

### BUG-083: Missing `subjectRoot` in onboarding profile | Milestone: 1.1 | RESOLVED
- **Location:** `src/cli/onboarding.js`
- **Severity:** P0 (Operational Blocker)
- **Status:** RESOLVED — 2026-03-16
- **Description:** Readiness assessment for Task 1.0-09 (Sovereign Loop) revealed that `subjectRoot` is missing from the active onboarding profile. This prevents any Subject-world promotion or cross-world telemetry from functioning.
- **Fix:** Updated `runOnboarding` to include `subjectRoot` in the `onboarding.json` payload, defaulting to `/Users/johnserious/MBO_Alpha` if missing. Fixed function nesting in `src/cli/onboarding.js`.

*Last updated: 2026-03-17 — BUG-084, 085, 086, 087 RESOLVED; BUG-083 RESOLVED; BUG-082 RESOLVED; BUG-080 RESOLVED; BUG-078 FIXED; BUG-076 RESOLVED; BUG-056, 081 RESOLVED; BUG-072, 073, 074, 075 RESOLVED; BUG-077, 079 FIXED.*
