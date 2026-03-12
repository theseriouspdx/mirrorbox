# CHANGELOG.md
## Mirror Box Orchestrator — Project Evolution

---

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
