# CHANGELOG.md
## Mirror Box Orchestrator — Project Evolution

### [1.1.18] — 2026-03-15
#### Added
- **`mbo mcp` recovery shortcut (`bin/mbo.js`):** one-command MCP recovery and verification flow (`teardown`, `setup`, `/health`, `graph_rescan`, `graph_server_info`, `init_state`, `handshake --status`, sqlite integrity check).

#### Changed
- **`mbo mcp` robustness hardening:**
  - Added explicit step-by-step progress logging.
  - Added bounded timeouts per recovery step.
  - Added tolerant success detection for known tool behaviors where useful output may be emitted with non-zero exit status.
  - Added health fallback handling and stderr tail diagnostics for MCP startup troubleshooting.
- **`mcp_query.js` timeout contract:** `graph_rescan` now uses an extended timeout window suitable for full graph rescans.

#### Docs
- Updated `docs/mcp.md` with `mbo mcp` recovery guidance.
- Updated `README.md` MCP section with recovery shortcut usage.


### [1.1.17] — 2026-03-13
#### Added
- **Persistent Operator (Task 1.1-H28):** 
  - Operator REPL in `src/index.js` now features a non-blocking background pipeline. 
  - Added `status`, `history`, and `stop`/`abort` commands. 
  - Integrated `AbortController` into `Operator` and `callModel` for model-call cancellation.
  - Implemented `bin/mbo.js` respawn loop for operator process persistence.
  - Persistent session history storage in `.mbo/session_history.json`.
- **DID Protocol v2 (Task 1.1-H24):** 
  - Implemented the hardened DID autonomous bounce loop in `src/auth/did-orchestrator.js`.
  - Added role-specific prompt builders in `src/auth/did-prompts.js` supporting RATIONALE, DIFF, and VERDICT.
  - Implemented blind isolation via content hashing of previous agent outputs.
  - Integrated surgical tiebreaker package delivery (DDR-007).
  - Wired DID into Stage 3 planning for Tiers 2 and 3.

### [1.1.16] — 2026-03-13
#### Governance
- **Restored Section 8 Affirmation Protocol:** Re-implemented the `nhash * salt = Hard State Anchor` calculation and the mandatory "I will not make assumptions..." pledge sequence in `AGENTS.md`.
- **Added Non-Persistence Mandate:** Explicitly prohibited the documentation, persistence, or commitment of any nhash-related values (Base Result, salt, or Anchor) to disk.
- **Implemented Invariant 14 (Write-File Restriction):** Prohibited use of `write_file` for overwriting existing files. `replace` is now mandatory for all modifications.
- **Enhanced Invariant 13 (Atomic Topology Backups):** Mandated a topology-preserving backup of all modified/created documents into `.dev/bak/` before any mutation.

### [1.1.15] — 2026-03-13
#### Fixed
- **BUG-066 completion:** finalized Streamable HTTP initialize routing in `src/graph/mcp-server.js` by delegating raw request handling to SDK transport flow, eliminating initialize hangs.
- **MCP daemon migration completion pass (1.1-H23):**
  - Operator now acts as a pure MCP client (`/health` check + fixed endpoint requests), with lifecycle management removed.
  - Added launchd install/remove support in `mbo setup` / `mbo teardown` (`src/cli/setup.js`, `bin/mbo.js`).
  - Added `scripts/mbo-ci-start.sh` for CI/Docker startup.
  - Removed legacy lifecycle files: `scripts/mbo-start.sh`, `scripts/mbo-watchdog.sh`, `src/utils/resolve-manifest.js`.
  - Updated `mcp_query.js` to fixed endpoint candidate (`127.0.0.1:7337`).

#### Validation
- `curl http://127.0.0.1:7337/health` returns `{"status":"ok",...}`.
- initialize POST probe returns HTTP 200 with `mcp-session-id` and JSON-RPC initialize result.
- `node mcp_query.js "tools_list"` and `node mcp_query.js "graph_search('...')"` return successfully.
- launchd auto-restart verified after `kill -9` (restart observed within 1s, below 15s criterion).

### [1.1.14] — 2026-03-13
#### Governance
- **H12 audit correction (traceability):**
  - Corrected H12 template claim to reflect delivered scope: `src/templates/AGENTS.md` is a 6-section starter baseline, while controller AGENTS docs remain 12-section canonical governance.
  - Recorded mixed-scope closure note for commit `becf656` (H12 docs plus BUG-065/066/067 runtime fixes) and pinned canonical H12 evidence files.

### [1.1.13] — 2026-03-13
#### Fixed
- **BUG-066: initialize routing robustness in `src/graph/mcp-server.js`**
  - Added initialize request detection and forced initialize handling onto a fresh `StreamableHTTPServerTransport` instance.
  - Prevents initialize from being routed onto an already-initialized transport session.
- **BUG-067: controller-repo auth usability (`bin/mbo.js`)**
  - Confirmed and documented branch-level behavior: `mbo auth` remains allowed globally, while runtime/init stay protected by controller guard.

#### Validation
- `node --check src/graph/mcp-server.js`
- `node --check bin/mbo.js`
- Live initialize probe validation pending runtime restart (current live MCP PID predates this patch).

### [1.1.12] — 2026-03-13
#### Fixed
- **BUG-065: dynamic MCP endpoint filtering + TCP-only false healthy probe in `mcp_query.js`**
  - Preserved explicit env endpoint (`MBO_PORT`) through candidate narrowing via `isEnvOverride`.
  - Relaxed project-id narrowing to keep canonical-root matches (`matchedRoot`) so case/path alias drift does not drop the live local endpoint.
  - Added HTTP POST preflight before initialize. Endpoints that accept TCP but hang on POST/initialize are now skipped quickly with explicit diagnostics.

#### Validation
- `MBO_PORT=61024 node mcp_query.js --diagnose graph_search "Canonicalize AGENTS.md"`
  - endpoint `61024` is attempted first and rejected with explicit `POST probe timeout`.
- `node mcp_query.js --diagnose "graph_search('Canonicalize AGENTS.md')"`
  - candidate order is deterministic and endpoint-specific failure reasons are emitted.

### [1.1.11] — 2026-03-13
#### Fixed
- **BUG-064: `mcp_query.js` initialize timeout under dual-manifest drift**
  - Replaced single-manifest endpoint pick with validated candidate resolution from both `.dev/run/mcp.json` and `.mbo/run/mcp.json`.
  - Added project identity scoring (`project_root` canonical match + `project_id` hash match).
  - Added strict preference filter: if any candidate matches current-project `project_id`, non-matching endpoints are ignored.
  - Added endpoint TCP preflight probe and multi-candidate fallback.
  - Added adaptive initialize timeout steps (`6000ms`, `12000ms`, `25000ms`) for slow cold starts.
  - Added compatibility path for `Server already initialized` responses when session header is present.
  - Added diagnostic mode (`--diagnose`) and function-style invocation parsing (`graph_search('...')`) to standardize operator preflight calls.

#### Validation
- `node --check mcp_query.js`
- `node mcp_query.js --diagnose "graph_search('Canonicalize AGENTS.md')"`
  - In this tool sandbox, localhost probes return `EPERM`; diagnostics now make this explicit and endpoint-specific.

### [1.1.10] — 2026-03-13
#### Changed
- **Keychain-backed one-command auth (`bin/handshake.py`, `bin/mbo.js`):**
  - Removed env-sentinel (`MBO_HUMAN_TOKEN`) dependency for grant/revoke.
  - `mbo auth <path> [--force]` remains the single user command.
  - macOS auth mutation paths now require OS user-presence checks for grant/revoke/toggle (`LocalAuthentication` prompt with Keychain-backed fallback).
  - Non-interactive contexts are fail-closed by default; CI bypass requires explicit policy contract (`CI=1`, `MBO_CI_AUTH_APPROVED=1`, optional `MBO_CI_AUTH_ACTIONS` / `MBO_CI_AUTH_SCOPES`).
  - Same-scope toggle revoke behavior retained and now follows the same human-presence gate.
  - Existing force warning path for Merkle mismatch and risky `.` confirmation flow preserved.

#### Docs / Tracking
- Updated `docs/auth.md` with macOS user-presence model and CI policy contract.
- Updated onboarding/operator docs to use `mbo auth` instead of token alias examples.
- BUG-062 marked `COMPLETED`; added BUG-063 to track stricter deterministic biometric/user-presence fallback hardening.
- Task `1.1-H17` marked `COMPLETED` in `projecttracking.md`.

#### Validation
- `node -c bin/mbo.js`
- `python3 -m py_compile bin/handshake.py`
- `python3 bin/handshake.py --status`
- `CI=1 python3 bin/handshake.py src` (expect deny)
- `CI=1 MBO_CI_AUTH_APPROVED=1 MBO_CI_AUTH_ACTIONS=grant MBO_CI_AUTH_SCOPES=src python3 bin/handshake.py src --force` (policy path, may still fail on Merkle/scope checks)

### [1.1.9] — 2026-03-13
#### Changed
- **Auth flow no longer detours through setup:** `mbo auth <scope> [--force]` now routes directly to handshake flow in `bin/handshake.py`.
- **Session status clarity:** expired sessions now print as `Expired` instead of misleading `Active` with negative TTL.
- **Human override controls:** `--force` allows explicit Merkle mismatch bypass with warning/audit logging; risky scope `.` requires explicit confirmation.
- **Auth toggle behavior:** repeating `mbo auth` for the currently active scope now revokes that session and prints resulting state.

#### Docs / Tracking
- BUG-062 updated to `IN PROGRESS` with partial implementation details and remaining close criteria.
- Task `1.1-H17` moved to `IN PROGRESS` in `projecttracking.md`.

#### Validation
- `node -c bin/mbo.js`
- `python3 -m py_compile bin/handshake.py`
- `mbo auth status`

### [1.1.8] — 2026-03-13
#### Added
- **BUG-061 logged and tracked:** Merkle scope drift + MCP query path drift now tracked in `BUGS.md` and `projecttracking.md` (`1.1-H16`).
- **BUG-062 logged and tracked:** Auth bootstrap usability failure for in-app/self-run/non-TTY contexts tracked in `BUGS.md` and `projecttracking.md` (`1.1-H17`).

#### Changed
- **`mcp_query.js` hardening:**
  - Enforced manifest-only endpoint resolution via `src/utils/resolve-manifest.js`.
  - Added canonical project-root assertion: helper now fails fast if `cwd` and `manifest.project_root` diverge.
  - Updated usage examples to explicit `node ./mcp_query.js ...` invocation.
- **Merkle scope contract explicitness (`bin/handshake.py`, `bin/init_state.py`):**
  - `state.json` now persists `merkle_scope` (currently `src`).
  - Integrity mismatch output now includes scope.
  - `--merkle-root` now computes relative to the requested target root to avoid ambiguous path semantics.
- **Pile verification scope fix (`src/relay/pile.js`):**
  - Promotion pre/post Merkle verification now hashes the normalized `approvedFiles` set, not whole project roots.
  - Eliminates false mismatch incidents caused by unrelated non-approved file changes.

#### Operational Recovery Note
- If handshake fails with `EXTERNAL_MUTATION_DETECTED` after tracked/approved source changes, rebaseline before auth:
  1. `python3 bin/handshake.py --reset`
  2. `python3 bin/handshake.py --pulse` (expect `[PULSE] OK`)
  3. `MBO_HUMAN_TOKEN=1 bin/handshake.py src`

#### Validation
- `node -c mcp_query.js`
- `python3 -m py_compile bin/handshake.py bin/init_state.py`
- `node -c src/relay/pile.js`
- `python3 bin/handshake.py --pulse`

### [1.1.7] — 2026-03-12
#### Added
- **TOKENMISER Dashboard and StatsManager refactor (Task 1.1-07, 1.1-08):**
  - Implemented per-model session and lifetime tracking for optimized vs not optimized tokens in `src/state/stats-manager.js`.
  - Added `getTotals()` and `getCarbonImpact()` (NaN placeholders pending cl100k_base integration).
  - Rewrote `src/cli/tokenmiser-dashboard.js` TUI with specified model-centric table layout, including "Total Session", "Total Lifetime", and "Project Carbon impact".
  - Updated `src/auth/call-model.js` to pass model identity to stats tracking.
  - Logged **BUG-056** to track `NaN` data source integration.
- **Task 1.1-H08 (MCP Runtime Contract v3) implementation pass:**
  - `src/graph/mcp-server.js` now writes manifest v3 with `manifest_version`, `checksum`, `epoch`, `instance_id`, `process_start_ms`, `status`, `restart_count`, and `incident_reason`.
  - Atomic manifest write contract added (temp file + fsync + atomic rename + directory fsync).
  - Startup split-brain guard added via CAS lock (`.dev/run/mcp.lock` / `.mbo/run/mcp.lock`) with stale-lock reclaim based on liveness + age.
  - Server lifecycle now persists deterministic `starting -> ready -> stopped|incident` transitions and per-process `instance_id` marker file.
  - Added integration smoke test `scripts/test-mcp-contract-v3.js` covering manifest validity, checksum, epoch increment, instance rollover, and corrupt-manifest recovery.

#### Changed
- **Operator trust/recovery enforcement (`src/auth/operator.js`):**
  - Added manifest v3 schema/checksum validation before trust.
  - Added process fingerprint checks (pid start time + command/root) before attach.
  - Added restart circuit breaker with explicit incident state: **3 restart failures within 30 seconds**.
  - Incident transition now writes manifest atomically with explicit `incident_reason`.

#### Validation
- `node -c src/graph/mcp-server.js`
- `node -c src/auth/operator.js`
- `node -c scripts/test-mcp-contract-v3.js`
- `node scripts/test-mcp-contract-v3.js` → `PASS mcp-contract-v3`

### [1.1.6] — 2026-03-12
#### Added
- **Runtime stability hardening:**
  - `bin/handshake.py` revoke path now bounds session-close execution with timeout and logs `SESSION_CLOSE_TIMEOUT` on overrun.
  - `scripts/mbo-session-close.sh` now bounds rebuild execution with watchdog timeout and returns control instead of hanging indefinitely.
  - `scripts/rebuild-mirror.js` defaults to static rebuild path; LSP enrichment is opt-in via `MBO_REBUILD_WITH_LSP=1` and bounded by timeout.
- **Startup stale-helper recovery:** `bin/mbo.js` now performs guarded stale helper cleanup (age threshold + session PID protection) so users do not need manual `pkill` for common lockup states.
- **Project-scoped runtime endpoint manifest:** Runtime MCP now writes `/.mbo/run/mcp.json` with endpoint metadata (`url`, `port`, `pid`, `mode`, `project_root`, `project_id`, `started_at`).

#### Changed
- **Runtime endpoint discovery:** `mcp_query.js` and `mcp_http_query.js` now read `./.mbo/run/mcp.json` instead of assuming fixed port `3737`.
- **Runtime DB path:** `src/graph/mcp-server.js` runtime DB target is now `/.mbo/mirrorbox.db` for project-local state.
- **Launcher root behavior:** `scripts/mbo-start.sh` now uses `MBO_PROJECT_ROOT` for runtime root/db/run paths and passes `--root=<project_root>` to MCP server.

#### Notes
- Dev-mode internals still use `.dev/run/*`; runtime multi-project path is `/.mbo/run/*`.

### [1.1.5] — 2026-03-12
#### Added
- **Graph Server Trust Contract (Task 1.1-10):**
  - Added `graph_server_info` MCP tool returning canonical root, project ID hash, index revision, and scan metadata.
  - Fixed server root resolution to derive from `__dirname` by default, eliminating `cwd` dependency.
  - Implemented client-side trust assertion in `Operator`: hard-fails on project ID mismatch and waits for active scans to complete.
  - Persisted index revision and last scan timestamp in the graph database.
- **Authoritative launch sequence implemented (Task 1.1-05):** `src/index.js` now enforces Step 1-7 boot order (Section 28.7).
- **Non-TTY Guards (Section 28.8):** Added strict exits for non-interactive environments when setup or onboarding is required.
- **Robust MCP Startup:** `src/auth/operator.js` now uses TCP probing (`_isPortBound`) and sentinel monitoring (`_waitForMCPReady`) to avoid race conditions.
- **Graceful Warm-Restart:** `scripts/mbo-start.sh` now exits with code 0 on port conflict, allowing session reuse.
- **MCP Session ID persistence:** `_sendMCPHttp` writes `mcp-session-id` to `.dev/run/mcp.session` on every assignment. `startMCP` restores it from disk on the warm-restart path before probing, so `tools/list` goes out with the correct header.
- **Stale session eviction:** `_initializeMCPWithRetry` detects when a restored session ID is rejected by the server (server restarted with new session), evicts `.dev/run/mcp.session`, nulls the ID, and falls through to a clean `initialize`.
- **SSE response parsing:** `_sendMCPHttp` now reads `Content-Type` from the response and, when `text/event-stream`, extracts the first `data:` payload from SSE frames before JSON-parsing. Fixes silent rejection of all `tools/call` and `initialize` responses when the server chose SSE framing.
- **Session file cleanup on shutdown:** `Operator.shutdown()` now deletes `.dev/run/mcp.session` to prevent a killed server's session ID from being mistakenly restored on the next cold start.
#### Fixed
- **BUG-053 (P0) — fully resolved:** Three root defects corrected: (1) `mbo-start.sh` exit-1 on warm restart, (2) ephemeral `mcpSessionId` lost across Operator reconstructions, (3) SSE-framed responses rejected by bare `JSON.parse`. All three failure modes now handled.
- **Onboarding Logic:** `checkOnboarding` now correctly returns status to `index.js` to handle TTY-specific onboarding triggers.
#### Changed
- **Milestone tracking updated:** Task `1.1-05` marked `COMPLETED`. BUG-053 marked `COMPLETED`.



### [1.1.4] — 2026-03-11
#### Added
- **Task 1.1-04 (`.mbo` init) operationalized:** `mbo init` wired in `bin/mbo.js`, invoking `src/cli/init-project.js` from invocation cwd.
- **Project scaffolding path active:** `.mbo/` + governance stubs + `.gitignore` policy generation now reachable through CLI subcommand.
- **Spec recovery completed:** `SPEC.md` reconstructed from `3be31ae` baseline and merged with Milestone 1.1 hardening contract sections.
- **Spec backups created:** `SPEC.corrupt.20260311182000.md` and `SPEC.v1.from-3be31ae.md` for audit trail.
#### Changed
- **Milestone tracking updated:** Task `1.1-04` marked `COMPLETED`; next action set to `1.1-05`.
- **Hardening line item adjusted:** `1.1-H05` set to `IN REVIEW` pending launch-sequence final verification with non-placeholder onboarding behavior.
#### Notes
- Branch includes side-project hardening changes (`mbo` launch guard, `mboauth` split command, startup port safety) for later reconciliation after 1.1 core milestones.

---

---

### [1.0-hardening] — 2026-03-11
#### Security
- **Agent self-authorization closed:** `bin/handshake.py` now requires `MBO_HUMAN_TOKEN` env var for all grant/revoke operations. Agents calling without it receive `[GATE] DENIED` and exit 1. Alias recommended: `alias mbo='MBO_HUMAN_TOKEN=1 python3 ~/MBO/bin/handshake.py'`.
- **write.deny sentinel added:** `lock_src()` now writes `.dev/run/write.deny` with a timestamp. `impl_step.sh` checks this sentinel as the first (fastest) gate before any write attempt.
- **`bin/impl_step.sh` created:** Atomic write gate enforcing write.deny + session.lock checks before any `src/` write. Records progress to `.dev/run/impl_progress.json`. All agent writes must route through this script.
- **`--merkle-root` flag added to `handshake.py`:** Computes and prints Merkle root of any path (defaults to `src/`). Used by `pile.js` for Subject integrity verification.
#### Fixed
- **operator.js reverted to HEAD:** Gemini had added unauthorized `relay.start()` call inside `handleApproval()` with wrong signature, and invented `_getSubjectMerkleRoot()`. Reverted.
- **Audit gate (1.0-06 diff):** Fixed to return `{ status: 'audit_pending' }` and stop. Previously was auto-rolling back instead of pausing for human review. Stage 11 removed from inline flow.
#### Cleanup
- **Hardcoded username removed from production code:** `bin/mbo_server.py`, `bin/pile_deploy.py`, `scripts/com.mbo.mcp.plist` (deleted), `com.johnserious.mbo-mcp.plist` (root, deleted).
- **plist templatized:** `scripts/com.mbo.mcp.plist.template` added with `%%MBO_ROOT%%`/`%%HOME%%`/`%%NVM_NODE_BIN%%` placeholders. `scripts/mbo-launchd-install.sh` updated to generate plist at install time. Generated file added to `.gitignore`.
- **`MBO_ALPHA_ROOT` env var:** Both `bin/mbo_server.py` and `bin/pile_deploy.py` now resolve Subject root via `os.environ.get("MBO_ALPHA_ROOT", ...)` with sensible default.
#### Documentation
- **`docs/auth.md`:** Handshake system, MBO_HUMAN_TOKEN guard, mbo alias, scope rules, write gate, session lifecycle.
- **`docs/mcp.md`:** MCP server, all 7 tools, launchd service, config, troubleshooting.
- **`docs/operator-guide.md`:** Gate 0, nhash, audit gate, §6B checklist, DID process, milestone tracking, common shell commands.
- **`docs/agent-onboarding.md`:** Agent quick reference — rules, file writing, approval gate, tier rules, key files, MCP tools.

### [1.0-planning] — 2026-03-11
#### Architecture
- **Milestone 1.0 two-world model locked:** Mirror = `/Users/johnserious/MBO` (live orchestrator), Subject = `/Users/johnserious/MBO_Alpha` (clone MBO operates on), Docker = ephemeral per-task sandbox for Stage 4.5/8 only.
- **Self-referential loop confirmed:** MBO develops MBO_Alpha. MBO_Alpha graduates to become the new MBO at 1.0.
- **3-agent DID reconciliation complete** (Claude session 1, Gemini CLI, Claude session 2). Plan saved to `.dev/sessions/milestone_1.0_plan.md`.
#### Completed
- **1.0-03 The Relay:** Implemented the Mirror-side UDS listener in `src/relay/relay-listener.js`. Configured to bind at `.dev/run/relay.sock` and ingest NDJSON packets into the Mirror EventStore with `world_id = 'subject'`.
- **1.0-04 The Pile:** Implemented the promotion engine in `src/relay/pile.js`. Supports rsync-based delta promotion from Mirror to Subject with Merkle-validated verification and checkpointing.
- **1.0-05 The Guard:** Implemented the synchronous validation layer in `src/relay/guard.js`. Enforces seven integrity rules including task binding, sequence continuity, and path scope isolation.
- **1.0-06 Stage 6/7/8:** Implemented `runStage6` (Implement), `runStage7` (Audit), and `runStage8` (Sync) in `operator.js`. Added `git diff` and `validator.py` generation to the Audit Gate.
- **1.0-07 Subject World graph routing:** Implemented Stage 2 graph routing in `operator.js`. Added `_graphQueryImpact` to direct queries based on `world_id`.
- **1.0-planning:** Architecture SPEC for Relay, Guard, and Pile integrated into `SPEC.md`.
#### Findings
- **Graph query tooling root cause identified:** `mcp_http_query.js` invocation bug — tool name was being passed as search term. Tools confirmed working correctly.
- **SPEC gap confirmed:** Stages 6–10 unimplemented. `operator.js` has no execution path after Stage 5 approval.
- **graph_rescan excludes SPEC.md:** `graph_rescan` only scans `src/`. SPEC.md only indexed on empty DB. Deferred fix — rescan is fast (88ms), should be triggered on session close.

### [1.0-MCP-fix] — 2026-03-11
#### Fixed (BUG-049, MCP tooling)
- **BUG-049 — fd3 dance removed (`scripts/mbo-start.sh`):** Removed vestigial `exec 3>&1` / `exec 1>&2` / `exec 1>&3` / `exec 3>&-` fd save-restore block. Caused silent fatal exit under `set -uo pipefail` in non-launchd contexts where fd 3 was invalid. `mcp-server.js` uses stderr exclusively; stdout ownership is irrelevant. BUG-049 CLOSED.
- **MCP query tools — SSE parsing (`mcp_http_query.js`, `mcp_query.js`):** Both tools were calling `JSON.parse(data)` directly on SSE-wrapped responses (`event: message\ndata: {...}`). Fixed by splitting on `\n\n` event boundaries and extracting the `data:` payload before parsing.
- **`mcp_query.js` — HTTP rewrite:** Replaced stdio `spawn` approach (incompatible with persistent HTTP server) with stateful HTTP client using session ID and SSE-aware parsing. Targets `http://127.0.0.1:3737/mcp`.
- **launchd service enabled:** `com.johnserious.mbo-mcp` plist was installed but disabled. Loaded with `launchctl load -w` — service now auto-starts on login and self-heals on crash.
#### Audit
- All 5 MCP tools (`graph_search`, `graph_query_impact`, `graph_query_dependencies`, `graph_query_callers`, `graph_query_coverage`) respond correctly via HTTP.
- `audit-m0.8.js`: 12/12 PASS. `validator.py --all`: ENTROPY TAX: PAID.

### [0.8.1] — 2026-03-10
#### Fixed (BUG-046, BUG-047, BUG-048)
- **BUG-046 — MCP restart loop (P0):** Migrated `src/graph/mcp-server.js` from `StdioServerTransport` to `StreamableHTTPServerTransport` on port 3737. Root cause was structural: stdio transport is per-connection, so every agent session spawned a fresh process, completed a full scan+enrich, then exited — causing launchd to respawn indefinitely. Fix: `GraphService` singleton owns all graph state; per-session `Server` + `StreamableHTTPServerTransport` pairs delegate to it. `enqueueWrite()` Promise chain serializes concurrent mutations; `isScanning` mutex with `finally` prevents overlapping rescans.
- **BUG-047 — Missing timestamps (P2):** All `echo` lines in `scripts/mbo-start.sh` and all `console.error` diagnostics in `mcp-server.js` now carry ISO 8601 UTC timestamps.
- **BUG-048 — NEXT_SESSION.md context drift (P1):** `scripts/mbo-session-close.sh` was writing `graph_search("${LAST_TASK_NAME}")` (the completed task) instead of `graph_search("${NEXT_TASK_DESC}")`. Fixed. Next session Gate 0 now searches by the upcoming task description.
#### Added
- **0.8-07 — Runtime Edge Ingestion (COMPLETED):** `ingestRuntimeTrace()` added to `StaticScanner`. Reads probe output (`data/runtime-trace.json`), upserts `DEPENDS_ON` edges with `source: 'runtime'` for each `type: 'dependency'` entry. New MCP tool `graph_ingest_runtime_trace` exposed. `runStage11()` added to `Operator` and wired after Stage 4.5 — non-fatal, catches and logs errors without blocking task completion.
- **`graph_rescan` tool:** New MCP tool for triggering a full `src/` rescan on demand. Queued through the write chain; safe to call concurrently.
#### Changed
- **`.mcp.json` / `.gemini/settings.json`:** Switched from `command/args` stdio auto-start to `url: "http://127.0.0.1:3737/mcp"`. launchd owns the server lifecycle; clients connect to the persistent HTTP endpoint.
- **`scripts/mbo-start.sh`:** Added nvm self-bootstrap (sources `$NVM_DIR/nvm.sh` when launched by launchd without user shell). Added port pre-flight kill (SIGTERM → SIGKILL on port 3737 before starting). Watchdog spawn removed — launchd handles respawn.
- **`src/graph/lsp-client.js` — `detectServer()`:** Now checks `node_modules/.bin/` via `__dirname`-relative path before falling back to `$PATH`. Works under launchd without any PATH configuration dependency.
- **`com.johnserious.mbo-mcp.plist`** (new file in repo root): Updated to add `MBO_PORT=3737`, `ExitTimeout: 5`, `HOME` and `NVM_DIR` env vars. Install with: `cp ~/MBO/com.johnserious.mbo-mcp.plist ~/Library/LaunchAgents/ && launchctl unload ... && launchctl load -w ...`

### [0.8.0] — 2026-03-11
#### Added
- **World: Subject (Sandbox):** Implemented `SandboxManager` for ephemeral Docker containers (Task 0.8-01, 0.8-02).
- **Isolation:** Enforced zero-network and read-only source mounts per Section 16 isolation contract.
- **Runtime Probe:** Developed the 0.8A instrumentation layer for Node.js tracing (Task 0.8-06).
- **Dry Run:** Orchestrated Stage 4.5 Virtual Dry Run with automatic teardown (Task 0.8-05).
- **Token Observability:** Added `token_log` persistent storage and `get_token_usage` MCP tool (BUG-045).
- **State Integrity:** Implemented persistent checkpoints and `world_id` chain-verification (BUG-040, BUG-041).

### [0.7.2] — 2026-03-10
#### Added
- **Context Budgeting (Milestone 0.7):** Implemented 3-layer token enforcement policy (Ingestion, Database, Assembly).
- **Ingestion Truncation:** Added heuristic token counting and automatic node truncation (800 token limit) in `StaticScanner.js` with signature and docstring preservation.
- **SQLite token_cap:** Enforced `nodes.content` length constraint (4000 chars) via `CHECK` constraint and non-destructive migration.
- **Assembly Cap:** Implemented 2000-token graph-context cap in `wrapContext` (`call-model.js`) with truncation notification.
- **Audit Refinement:** Updated `.dev/audit/audit-m0.7.js` with comprehensive mocking to ensure deterministic pipeline verification.

### [0.7.1] — 2026-03-09
#### Added
- **DID Qualitative Consensus (0.7-01):** Formally updated `SPEC.md` to redefine consensus from "Checksum Parity" to "Qualitative Intent."
- **ExecutionPlan Schema:** Added `intent`, `stateTransitions`, and `invariantsPreserved` to the formal contract (Section 13).
- **Stage 1.5 Human Intervention Gate:** Introduced mandatory pause for human context pinning/exclusion before planning begins (Section 15).
- **Consensus Metrics:** Redefined Stage 3C and 4C to prioritize architectural convergence and project invariants over literal file-list matching.

### [0.6.5] — 2026-03-09
#### Added
- **Session Handoff Persistence (0.6-04):** Refactored `scripts/mbo-session-close.sh` to automatically generate `NEXT_SESSION.md`.
- **Handoff Automation:** Script now captures last task ID, name, status, and uses `projecttracking.md` to intelligently detect the next action for the next session.
- **Security Compliance:** Removed all `nhash` persistence from handoff files to comply with `AGENTS.md` Section 8.1 (Secrecy of State).
- **Integrity Tracking:** Handoff now explicitly records database backup SHA-256 and `PRAGMA integrity_check` results.

### [0.6.4] — 2026-03-09
#### Fixed (Audit PASS)
- **BUG-038: JavaScript Graph Enrichment**: Implemented static fallback for import resolution in `src/graph/static-scanner.js`.
- **Placeholder ID Collision**: Fixed bug where relative imports across different files collided in the Intelligence Graph. Placeholder IDs for relative paths are now unique per source file.
- **`src/graph/static-scanner.js`**: Refactored `enrich()` to correctly group placeholders by all importing files and properly trigger `staticEnrich()` when no LSP is detected for a language.

### [0.6-audit] — 2026-03-09
#### Audit
- **Milestone 0.6 audit** run against full task set (0.6-00 through 0.6-03).
- Initial verdict: FAIL (Critical: `operator` role undefined; High: heuristic fallback unreachable).
- Both blocking fixes confirmed applied from prior session. Re-audit verdict: PASS_WITH_CONDITIONS.
- DID reconciliation with Codex: agreed on `operator` role fix; Stage 5 gate / world_id / pre-mutation checkpoint deferred to 0.7/0.8 as out-of-scope for 0.6.
#### Filed
- **BUG-042 (P2):** `graphSummary` truncation branch unreachable — field never populated.
- **BUG-043 (P2):** PID file not written for default agent name `operator` in `mbo-start.sh`.
- Audit artifacts: `.dev/audit/0.6_20260309_ClaudeCode/`

### [0.6.3] — 2026-03-09
#### Fixed
- **`src/graph/mcp-server.js`**: `graph_query_impact` now calls `getGraphQueryResult()` instead of `getImpact()`. Was returning raw edge rows `{id, relation, source}` instead of the `GraphQueryResult` contract `{subsystems, affectedFiles, callers, callees, coveringTests, dependencyChain}`. Agents were getting useless results and falling back to full SPEC.md load.
#### Changed
- **`AGENTS.md` Section 1.5**: Stripped to 3 lines. Removed manual PID verification instructions, agent identity tables, and client config tables that were causing agents to re-run MCP startup manually.
- **`AGENTS.md` Section 11**: Rewrote with absolute DB paths, explicit MCP tool name table, and auto-start confirmation table. Removed relative paths and ambiguous references Flash was misreading.
- **`letsgo.md` Gate 0**: Changed from "use graph tools to find relevant sections" to "run the exact queries listed in NEXT_SESSION.md Section 1." Eliminates exploratory search at session start.
- **`NEXT_SESSION.md` Section 1**: Now includes explicit graph queries for the next task. Agent runs those four queries and stops — no derivation required.
- **`.gemini/settings.json`**: Created at project root. Gemini MCP now auto-starts via project-level config, same as Claude's `.mcp.json`. Fixed command format (`"bash"` + absolute path args, not combined string).
- **`.mcp.json`**: Added `trust: true` to match Gemini config.
#### Filed
- **BUG-037 (P2)**: MCP lifecycle owned by CLI client configs, not orchestrator. Gate 0 `startCommand` should own this. Deferred to Milestone 0.9.

### [0.6.2] — 2026-03-09
#### Added
- **Tier 3 DID (Claude wins reconciliation)**: Background MCP process isolation via PID files.
  - `scripts/mbo-start.sh`: Added `--agent=<claude|gemini>` flag; writes `$$` to `.dev/run/{agent}.pid` before `exec` so PID file targets the node process exactly.
  - `scripts/mbo-session-close.sh`: Added `--terminate-mcp --agent=<name>` branch; SIGTERM → 5s grace → SIGKILL; stale PID detection and cleanup.
  - `AGENTS.md §1.5`: Mandates background start with `--agent`; PID verification step; agent identity table; updated client config table.
  - `AGENTS.md §6C`: Added step 2 — terminate MCP via `mbo-session-close.sh --terminate-mcp`; renumbered steps.
  - `BUGS.md`: Filed BUG-036 (P2) — `mcp-server.js` `shutdown()` missing WAL checkpoint before `process.exit(0)`.

### [0.6.1] — 2026-03-09
#### Added
- **0.6-01**: Operator & Session Manager implemented (`src/auth/operator.js`).
  - Fixed `sendMCPRequest` timeout leak (`clearTimeout` on resolve and reject).
  - Added `getSafelist()` + `_fileExists()` for Tier 0 gate enforcement (safelist membership + physical file existence).
  - Added `confidence < 0.6` clarifying question gate in `classifyRequest`.
  - `summarizeSession` live via `callModel`; placeholder guard; replaces session history; logs `[CONTEXT RESET]`.
  - `getGraphCompleteness()` queries `edges WHERE source = 'runtime'` — no longer hardcodes `'skeleton'` for runtime.
  - `processMessage` logs classification + routing to event store before state snapshot.
- **`src/index.js`**: Operator initialized, MCP started, stdin REPL loop, clean shutdown on close.

### [0.6.0] — 2026-03-09
#### Added
- **0.6-00**: Universal MCP Session Start (DID-validated, Claude + Gemini reconciled).
  - Created `scripts/mbo-start.sh`: vendor-agnostic MCP loader for Claude CLI, Gemini CLI, Python orchestrators.
  - All status output routed to stderr; stdout reserved strictly for JSON-RPC.
  - Dynamic `DB_PATH` resolution via `--mode=dev` / `--mode=runtime` flags.
  - `PRAGMA integrity_check` + `PRAGMA wal_checkpoint(TRUNCATE)` on every launch for integrity and stale WAL recovery.
  - Added `--check` passthrough (early-exit for check-only mode is P2 follow-on).
- **AGENTS.md Section 1.5**: Mandates `mbo-start.sh` as source of truth for MCP lifecycle for all future agents and vendors.

---

### [0.5.1] — 2026-03-09
#### Added
- **Invariant 11 Enforcement**: Updated `src/auth/call-model.js` with a hard blockade against proprietary search tools (`grep`, `codebase_investigator`).
- **Tool Agnosticism**: Mandated the use of MBO MCP tools for all codebase discovery operations.
#### Fixed
- **Milestone 0.6.0 Investigation**: Confirmed "Operator" is currently unimplemented and mapped the integration path in `src/auth/call-model.js`.

---

### [0.4.3] — 2026-03-09
#### Added
- **0.4B-02**: Implemented Intelligence Graph MCP Server.
  - Exposed 5 tools via `StdioServerTransport`: `graph_query_impact`, `graph_query_callers`, `graph_query_dependencies`, `graph_query_coverage`, `graph_search`.
  - Integrated `@modelcontextprotocol/sdk` (Node.js).
  - Created `scripts/test-mcp-server.js` for tool verification.
- **0.4B-03**: Implemented SPEC.md indexing.
  - Added `scanMarkdown` to `StaticScanner` for regex-based header extraction (## Section, ### Sub-header).
  - Indexed headers as `spec_section` nodes with `DEFINES` edges from the file node.
  - Created `test-spec-indexing.js` for verification.
- **0.4B-04**: Coordinate Precision and Integrity Refactoring.
  - Updated `src/graph/static-scanner.js` to capture identifier-level coordinates (`nameStartLine`, `nameStartColumn`).
  - Updated `enrich` logic to use both line and column for precise LSP symbol matching, preventing same-line collisions.
  - Implemented **Stale Symbol Purge** (Adversarial Finding #5): `scanFile` now purges all existing nodes/edges owned by a file before re-scanning.
  - Exposed `graph_update_task` MCP tool for incremental graph updates after task completion.
- **0.4B-05**: No-LSP Fallback and Robustness.
  - Implemented **Robust Warmup** (Adversarial Finding #1): Added 3-attempt retry loop with 500ms backoff for LSP requests during indexing.
  - Implemented graceful detection and user notification for missing LSP servers.
  - Implemented global process registry in `LSPClient` to prevent orphan child servers.
  - Added `SIGTERM` and `uncaughtException` handlers to `mcp-server.js`.
#### Changed
- **GraphStore**: Fixed Invariant 7 (Adversarial Finding #3) — `upsertEdge` now prevents `static` scan from overwriting `runtime` source.
- **GraphStore**: Improved `getGraphQueryResult` subsystem heuristic and ID formatting for Section 13 compliance.
- **DBManager**: Added virtual columns and index (`idx_nodes_coords`) for coordinate-based symbol lookups.
- **Dependencies**: Added `@modelcontextprotocol/sdk` to `package.json`.

---

### [0.4.2] — 2026-03-09
#### Added
- **0.4B-01**: Implemented LSP enrichment for cross-file call resolution and import edges.
  - Created `src/graph/lsp-client.js` with `vscode-jsonrpc` for stdio transport.
  - Implemented `LSPClient` lifecycle: R-01 (rootUri), R-02 (waitForReady), R-03 (didOpen/didClose), R-05 (ephemeral shutdown), and R-06 (Watchdog registration).
  - Implemented cross-file `resolveDefinition` and `getCallHierarchy` (incoming/outgoing).
  - Added `resolveImport` Spec Extension to `GraphStore` for atomic placeholder rewriting.
#### Changed
- **Scanner Enrichment**: 
  - Updated `src/graph/static-scanner.js` to store 0-indexed position metadata (R-04).
  - Implemented Phase 2 `enrich(projectRoot)` logic with file-grouping (R-03) and robust `json_extract` metadata lookups.
  - Integrated `LSPClient` auto-detection for TypeScript, JavaScript, and Python.
- **Dependencies**: Added `vscode-jsonrpc` and `vscode-languageserver-protocol` to `package.json`.
#### Fixed
- **BUG-033**: Enforced ephemeral `LSPClient` instances to prevent task-boundary coupling.
- **BUG-035**: Verified `db.get()` existence in `db-manager.js` for enrichment pass lookups.

---

### [0.4.1] — 2026-03-09
#### Added
- **0.4A-03**: Implemented Intelligence Graph queries and BUG-009.
  - Added `getCallers`, `getDependencies` (refined for imports/calls), and `getImpact` (recursive 3-degree) to `GraphStore`.
  - Implemented `content_hash` staleness logic in `StaticScanner`. Uses SHA-256 hashing to skip redundant re-scans.
- **0.4A-04**: Implemented Section 13 `GraphQueryResult` formal contract in `GraphStore`.
#### Fixed (0.4A Structural Audit)
- **Structural Reconciliation**: Removed hallucinated methods (`findNodeByPath`) and fixed SQL syntax errors introduced during execution.
- **Database Integrity**: Scrubbed databases of garbage nodes; verified zero unapproved metadata fields remain.
- **Event Store Chain**: Verified chain integrity through seq 18 following a `RECOVERY` reconciliation event.

---

### [0.4.0] — 2026-03-09
#### Added
- **0.4A-01**: Implemented Tree-sitter integration for `src/` scanning.
  - Extracted nodes (file, function, class) and edges (DEFINES, IMPORTS).
  - Fixed nodeSubclasses crash on Node v24 arm64 (passed full grammar objects).
- **0.4A-02**: Implemented `GraphStore` and `StaticScanner` as parameterized classes for instance separation (dev vs runtime).
#### Fixed (0.4A Audit Findings)
- **FAIL (Item 5)**: Reconciled `event-store.js` write path with migrated `chain_anchors` schema.
- **FAIL (Item 5)**: Reconciled `SPEC.md` Section 7 hash envelope with actual implementation fields.
- **WARN (Item 6)**: Corrected `AGENTS.md` dev-graph server reference to mark as future task.
- **scripts**: Updated `test-chain.js` to match `run_id` primary key.
#### Governance
- **AGENTS.md**: Updated Section 9 to mandate "Diff-Only Edits" and "Mandatory Peer Review" for high-risk tasks.

---

### [0.3.1] — 2026-03-08
#### Fixed
- **BUG-027**: Added `seq: number` and `prev_hash: string | null` to Event interface in SPEC.md.
#### Changed
- **SPEC.md**: Documented `chain_anchors` table and hash verification envelope in Section 7.
- **SPEC.md**: Split Milestone 0.4 into 0.4A (Skeleton) and 0.4B (Enrichment) in Appendix A.
- **SPEC.md**: Added Skeleton Graph Safety Invariant to Section 8.
- **SPEC.md**: Added Redaction Gate and Schema Validation to Section 10 Enforcement.
- **SPEC.md**: Documented implementation decision for Intelligence Graph MCP server (`@modelcontextprotocol/sdk`).
- **AGENTS.md**: Mandated DID protocol for all modifications to SPEC.md, AGENTS.md, or the governance directory in Section 2.
- **PRE-0.4-02**: Completed MCP server research spike. Documented rationale for using official SDK in Section 6.

---

### [0.3.0] — 2026-03-08
#### Added
- **0.3-01**: Implemented Radius One State and Event Foundation.
  - Implemented `db-manager.js` for SQLite initialization, integrity checks, and schema migration logic.
  - Implemented `event-store.js` with append-only deterministic chaining (seq-based ordering).
  - Implemented `redactor.js` to enforce Invariant 8 (Secret Firewall).
  - Implemented `state-manager.js` for snapshotting and session recovery.
  - Created `verify-chain.js` and `verify-chain.py` audit utilities.
#### Fixed (Radius One Audit Findings)
- **BUG-023**: Fixed redactor offset confusion in `String.replace()` by adding explicit capture groups.
- **BUG-024, BUG-026**: Upgraded chain hash to cover full `id, seq, stage, actor, timestamp, payload, parent_event_id, prev_hash` envelope. Added atomic `chain_anchors` mechanism and immutable chaining (single INSERT, no PENDING state).
- **BUG-025, BUG-028**: Fixed non-deterministic chain ordering by introducing transaction-assigned `seq` primary key.
- **BUG-027**: Fixed `recover()` silently corrupting state by restricting queries to `stage = 'STATE'` events.
- **BUG-029**: Gated DB corruption rollover behavior behind `NODE_ENV` to prevent silent destruction in production.

---

### [0.2.2] — 2026-03-08
#### Fixed
- **BUG-019 (P0)**: Implemented Section 10 firewall in `callModel`.
  - Added `context` parameter to `callModel`.
  - Implemented `<PROJECT_DATA>` XML wrapping and system directive enforcement.
- **BUG-020 (P1)**: Added explicit timeout handlers (`req.on('timeout')`) to `callLocalProvider` and `callOpenRouter` to prevent process hangs.
- **BUG-021 (P1)**: Resolved OpenRouter key inconsistency.
  - Exposed `key` from `detectOpenRouter`.
  - Unified key usage in `callOpenRouter` via the resolved provider config.
- **BUG-022 (P1)**: Re-aligned role routing with Section 11 vendor assignments.
  - Removed `findProvider` helper to prevent collapsing roles to local.
  - Enforced Claude-first for planners and Gemini-first for reviewer.
  - Implemented frontier-first logic for onboarding and tiebreaker roles.
- **Robustness**: Added binary existence guard to `callCliProvider` to prevent `spawnSync` crashes.

### [0.2.1] — 2026-03-08
#### Governance
- Added Section 9 (Strict Mode) to `.dev/governance/AGENTS.md`. Constrains agents from stylistic/linting changes without functional justification. Hard State rule renumbered to Section 10.
- Logged BUG-019 through BUG-022 from dual-audit (Claude DID + third-party audit) of Milestone 0.2 implementation. No code written this session — audit findings queued for next session with `go`.

### [0.2.0] — 2026-03-08
#### Added
- **0.2-05**: Unified `callModel` function with multi-provider round-trips.
  - Implemented `src/auth/call-model.js` supporting CLI (Claude, Gemini, OpenAI), Local (Ollama), and OpenRouter.
  - Verified round-trips with Gemini CLI and OpenRouter.
  - Added `.dev/governance/TECHNICAL_DEBT.md` for OpenAI/Ollama pending verification.
  - **Fixed P0/P1 issues via Adversarial Review**:
    - BUG-014: Resolved ghost binary crash in `session-detector.js`.
    - BUG-015: Added 30s timeout to CLI spawns in `call-model.js`.
    - BUG-016: Fixed JSON escaping for OpenAI CLI via `JSON.stringify`.
    - BUG-017: Re-aligned model routing with SPEC priority (Local > CLI > OpenRouter).
    - BUG-018: Implemented missing `tiebreaker` role in `model-router.js`.
- **0.2-04**: Model routing logic implementation.
  - Implemented `src/auth/model-router.js` with priority-based role mapping.
  - Priority established: Local > CLI Session > OpenRouter.
  - Verified deterministic mapping for all specification roles (Classifier, Planner, Reviewer, etc.).
- **0.2-03**: OpenRouter fallback operational.
  - Implemented `src/auth/openrouter-detector.js` prioritizing `OPENROUTER_API_KEY` environment variable.
  - Verified authentication and connectivity to OpenRouter API.
- **0.2-02**: Local model detection (Ollama, LM Studio).
  - Implemented `src/auth/local-detector.js` using HTTP health checks.
  - Verified detection of `Ollama` in Darwin environment.
- **0.2-01**: CLI session detection for Claude, Gemini, and OpenAI.
  - Implemented `src/auth/session-detector.js`.
  - Verified detection of `Claude Code` and `Gemini CLI` sessions in Darwin environment.
  - Soft auth checks for configuration and environment variables.

### [0.1.0] — 2026-03-08
#### Environment Foundation
- Initialized repository with governance documents (`AGENTS.md`, `SPEC.md`, `BUGS.md`, `projecttracking.md`).
- Established `Dual Independent Derivation (DID)` protocol.
- Verified Docker build environment.
- Verified cross-platform Gate 0 requirements.

---

*Last updated: 2026-03-09*

## [0.6.0-prep] - 2026-03-09
### Added
- Pre-0.6 Adversarial Audit PASS.
- mirrorbox.db schema migration and LSP coordinate verification.
- src/auth/call-model.js: event store logging for prompt/response.
- scripts/mbo-session-close.sh: atomic backup and integrity check.
### Fixed
- src/auth/model-router.js: repaired syntax error in routing logic.
- src/auth/call-model.js: strengthened injection heuristic check.

### [preflight-compiled] — 2026-03-09
#### Added
- **`.dev/reports/archive/preflight-did-compiled.md`**: Permanent compiled record of the
  pre-build DID analysis (Claude + Gemini independent runs + tiebreaker). Summarizes all
  confirmed blockers, key divergences, off-the-shelf audit consensus, dangerous spec
  assumptions, and resolution status for each finding.
#### Changed
- **`.dev/sessions/NEXT_SESSION.md`**: Removed preflight experiment references. Session
  handoff now points cleanly at Task 0.6-02 as the active work. Preflight phase closed.


### [experiment-compiled] — 2026-03-09
#### Added
- **`.dev/reports/archive/experiment-compiled-results.md`**: Compiled results of the context
  loading experiment suite (E1, E2, E2B, E6 complete; E3/E4/E5 deferred). Key finding:
  graph-driven loading achieves 12–44x token reduction. MCP must be live at session start
  for autonomous querying. Gate 0 bottleneck identified and fixed.
#### Changed
- **`NEXT_SESSION.md`**: Removed experiment references. Points cleanly at 0.6-02.
