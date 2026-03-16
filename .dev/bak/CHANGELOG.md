# CHANGELOG.md
## Mirror Box Orchestrator — Project Evolution

---

### [1.1.18] — 2026-03-13
#### Governance
- **Spec alignment with project tracking:** Added explicit contracts for open/active hardening tasks in `.dev/spec/SPEC.md`:
  - Section 33 — Agent Output Streaming Contract (`1.1-H27`)
  - Section 34 — Persistent Operator Window Contract (`1.1-H28`)
  - Section 35 — Context Minimization & Tiered Routing Contract (`1.1-H29`)
- **Traceability matrix added:** Added Appendix D in `.dev/spec/SPEC.md` mapping all `projecttracking.md` tasks to spec coverage.
- **Roadmap sync:** Updated `ROADMAP.md` status markers and milestone checklists to match `projecttracking.md` as of 2026-03-13.


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
- `node mcp_query.js --diagnose "graph_search('Canonicalize AGENTS.md')"`

### [1.1.11] — 2026-03-13
#### Added
- **Task 1.1-H12: Canonicalize AGENTS.md & Create Starter Template**
  - root `AGENTS.md` and `.dev/governance/AGENTS.md` now share a unified v1.0 structure (12 sections).
  - Synchronized session handshake, nhash, and Gate 0 protocols across all governance docs.
  - Created `src/templates/AGENTS.md` as a project-agnostic starter template for subject projects.

### [1.1.10] — 2026-03-13
#### Fixed
- **BUG-066: initialize transport routing in MCP server**
  - `src/graph/mcp-server.js` now detects initialize requests and always serves them via a fresh transport instance.
  - Prevents initialize from being routed onto a pre-initialized session transport under mixed-client reconnect patterns.
- **BUG-067: preserve `mbo auth` behavior from controller repo**
  - `bin/mbo.js` auth path remains globally available; runtime/init guard stays enforced separately.

#### Validation
- `node --check src/graph/mcp-server.js`
- `node --check bin/mbo.js`
- `node --check mcp_query.js`

### [1.1.9] — 2026-03-13
#### Fixed
- **BUG-065: `mcp_query.js` dynamic endpoint robustness under live MCP drift**
  - Preserved explicit `MBO_PORT` candidate during endpoint narrowing (env override is no longer dropped when a `project_id` match exists).
  - Relaxed candidate filtering to keep canonical-root matches, mitigating case-variant path hash drift (`/Users/.../MBO` vs `/Users/.../mbo`).
  - Added fast POST preflight before initialize to detect/skip endpoints that accept TCP but hang MCP POST requests.

#### Validation
- `MBO_PORT=61024 node mcp_query.js --diagnose graph_search "Canonicalize AGENTS.md"`
- `node mcp_query.js --diagnose "graph_search('Canonicalize AGENTS.md')"`

### [1.1.8] — 2026-03-13
#### Fixed
- **BUG-064: `mcp_query.js` initialize timeout under dual-manifest drift**
  - Replaced single-manifest endpoint selection with validated candidate resolution across both `.dev/run/mcp.json` and `.mbo/run/mcp.json`.
  - Added project identity scoring (`project_root` canonical match + `project_id` hash match) and hard preference for matching project IDs when present.
  - Added endpoint TCP preflight probe and multi-candidate fallback before initialize.
  - Added adaptive initialize timeouts (`6000ms`, `12000ms`, `25000ms`) for slow cold-start servers.
  - Added compatibility handling for `Server already initialized` responses that still include `mcp-session-id`.
  - Added `--diagnose` mode and function-style invocation parsing (`graph_search('...')`) for deterministic in-app troubleshooting.

#### Validation
- `node --check mcp_query.js`
- `node mcp_query.js --diagnose "graph_search('Canonicalize AGENTS.md')"`
  - In this tool sandbox, localhost probes return `EPERM`; diagnostics now report endpoint-specific probe failures explicitly.

### [1.1.7] — 2026-03-13
#### Fixed
- **1.1-H15 BUG-057: MCP stream-destroyed incident**: Server no longer enters `incident` state when clients disconnect during long-running graph scans.
  - `safeHandleTransportRequest`: wraps all `transport.handleRequest` call sites — suppresses `ERR_STREAM_DESTROYED` / write-after-end only when dual condition is true (`isStreamDestroyedError && isSocketGone`); all other errors re-throw normally.
  - `safeSSEWrite`: guards `/stream` SSE endpoint writes; listener self-removes on destroyed stream; `res.end()` guarded in `req.on('close')`.
  - `autoRefreshDevIfStale`: body wrapped in `enqueueWrite` — serializes startup auto-rescan with `graph_rescan` and `graph_update_task` writes, preventing `isScanning` flag race.
  - Fix derived via 3-agent DID (Claude/Gemini/Codex) with tiebreaker arbitration on two unresolved questions.
- **BUG-058**: Resolved as part of 1.1-H15 (`autoRefreshDevIfStale` queue serialization).

### [1.1.6] — 2026-03-12
#### Fixed
- **1.1-H05 Authoritative Launch Sequence**: Full MCP server detachment and startup robustness across macOS terminal, launchd, Docker, and CI vendor environments.
  - `scripts/mbo-start.sh`: `nohup` + `disown` detachment — server survives shell exit and SIGHUP. Port stability via manifest port reuse. Stale sentinel cleared before poll. TCP liveness probe after sentinel detection. PID file written after confirmed readiness. `exit 0` — no `wait`. Canonical `MBO_PROJECT_ROOT` via `pwd -P` exported before node spawn.
  - `src/auth/operator.js`: Fixed undefined `sentinelPath` bug in `_waitForMCPReady`. Added manifest port read + TCP liveness probe after sentinel. Process fingerprint checks degrade gracefully when `ps(1)` unavailable (Docker/CI minimal images).
  - `src/graph/mcp-server.js`: `fs.realpathSync` canonicalization in `parseArgs()` with try/catch for Docker late-mount safety. Trust contract comment added.
- **1.1-H08 MCP Runtime Contract v3**: Confirmed closed. Manifest v3 schema, CAS startup lock, process fingerprint, circuit breaker, and acceptance tests — all verified 2026-03-12.

### [1.1.5] — 2026-03-12
#### Added
- **1.1-07 Tokenmiser Value-Tracking**: Real-time token and cost attribution for all model calls.
- **1.1-08 SHIFT+T Stats Overlay**: Persistent global dashboard showing Project Lifetime Savings, Average Session, and Carbon Impact.
- **1.1-11 Agent Header Status Bar**: Real-time Green (Actual) / Red (Baseline) cost metrics on every agent panel.
- **1.1-09 Immutable Baseline**: Automated project scan during onboarding to anchor cost-savings math.
- **1.1-H09 Pricing Persistence**: Local cache of OpenRouter model rates with static fallback in `.mbo/pricing_cache.json`.
- **`src/utils/pricing.js`**: OpenRouter model pricing fetcher and cache.
- **`src/state/stats-manager.js`**: Lifetime savings and session metrics persistence in `.mbo/stats.json`.
- **`src/cli/tokenmiser-dashboard.js`**: TUI rendering logic for Agent Header and SHIFT+T Overlay.

### [1.1.4] — 2026-03-12
#### Fixed
- **1.1-06 Validator failure recovery**: Implemented pipeline halt on `validator.py` failure in `operator.js`. Validator logs are now captured and injected into `this.stateSummary.executorLogs`, triggering a re-entry to the Stage 3 planning stage (up to 3 attempts). Ensures implementation correctness via automated feedback loop.

### [1.1.3] — 2026-03-11
#### Added
- **1.1-03 mbo setup wizard**: Interactive first-run wizard (`src/cli/setup.js`). Detects CLI tools (claude/gemini/codex), queries Ollama for local models, reads/collects API keys, builds recommended config, supports manual role assignment. Saves to `~/.mbo/config.json`. Non-TTY guard for CI/Docker.
- **`src/cli/detect-providers.js`**: CLI detection via `which`, Ollama model name query (2s timeout), env key reads.
- **`src/cli/shell-profile.js`**: Shell profile detection and idempotent `export KEY=` append.
- **`bin/mbo.js`**: `mbo setup` subcommand routes directly to wizard and exits.
- **`src/index.js`**: Config existence check at `main()` entry — triggers wizard inline if `~/.mbo/config.json` missing.

### [1.0.0] — 2026-03-11
#### Added
- **1.0-09 Sovereign Loop**: MBO successfully patches its own codebase and promotes changes from Mirror to Subject World (`MBO_Alpha`). Verified via Relay listener and Audit Gate in `index.js`.
- **1.0-10 Assumption Ledger**: Implemented Section 27 protocol in `operator.js`. Pre-execution audit of task assumptions with entropy scoring and hard blocker enforcement.
- **Relay & Telemetry**: Real-time event streaming via EventEmitter in `EventStore` and `/stream` SSE endpoint in `mcp-server.js`.
- **Infrastructure**: Added `bin/pile_deploy.py` for Merkle-validated Mirror → Subject promotion and `bin/validator.py` for entropy tax enforcement.
- **Milestone 1.0 Close**: All nine security invariants verified via External Invariant Test Suite.
#### Fixed
- **BUG-049**: Fixed MCP signal trap stderr redirect and fd 3 closure.
#### Governance
- Milestone 1.0 marked COMPLETED. Sovereign Factory is fully operational.

### [0.9.2] — 2026-03-10
### Added
- Sovereign Factory Protocol (Fortress 2.0).
- bin/handshake.py: Merkle-verified permission elevation.
- bin/validator.py: Entropy Tax enforcement (LOC, CC, Nesting, Imports).
- bin/init_state.py: Day Zero baseline utility.
- .git/hooks/pre-commit: Physical enforcement gate.
- Section 12 to AGENTS.md (Operational Workflow).
- Invariant 10 & 11 to SPEC.md.

... [rest of changelog]
