
IMPORTANT: The file content has been truncated.
Status: Showing lines 1800-2131 of 2131 total lines.
Action: To read more of the file, you can use the 'start_line' and 'end_line' parameters in a subsequent 'read_file' call. For example, to read the next section of the file, use start_line: 2132.

--- FILE CONTENT (truncated) ---
- All subsequent updates: The Pile only

**26.5 Rollback**
If any step fails after Step 5: restore Subject from checkpoint, delete `.dev/run/pile.lock`, resume Mirror writes, emit `PILE_FAILED` (step number + error), surface to human.

---

## Section 27 — Pre-Execution Assumption Ledger

### Purpose

Before any planning or code derivation begins, the orchestrator must audit every assumption
it would silently make. This converts implicit risk into an explicit, reviewable budget.
The human sees the full uncertainty surface before typing `go`.

### Assumption Record Format

Each assumption is logged with four fields:

| Field | Description |
|-------|-------------|
| **ID** | Sequential integer scoped to the task (A1, A2, ...) |
| **Category** | `Logic` / `Architecture` / `Data` / `UX` / `Security` |
| **Statement** | One falsifiable sentence. Confirmable or deniable with a single answer. |
| **Impact** | `Critical` — wrong choice breaks correctness or safety. `High` — wrong choice causes rework. `Low` — cosmetic or easily reversed. |
| **Autonomous Default** | The exact decision made if the human types `go` without correction. Concrete and specific — no hedging. |

### Blocking Unknowns

Assumptions that cannot be inferred from the project state at any confidence level are
classified as **BLOCKED**, not assumed. Format:

> `BLOCKED: [what is missing] — cannot proceed until resolved.`

A task with any BLOCKED item cannot receive `go`. Blockers must be resolved before the
ledger is finalized.

### Entropy Score

```
Entropy = (Critical × 3) + (High × 1.5) + (Low × 0.5)
```

| Score | Label | Action |
|-------|-------|--------|
| < 5 | **Low Entropy** | Proceed to `go` gate |
| 5–10 | **Medium Entropy** | Surface ledger; request human confirmation on Critical items only |
| > 10 | **High Entropy** | Flag task. Propose decomposition into sub-tasks before any `go` is issued. |

### Assumption Dependency Chain

If Assumption B is only relevant given Assumption A, note it:
> `A[N] depends on A[M] — if A[M] is corrected, A[N] may not apply.`

This prevents the human from needing to trace cascading consequences manually.

### Ledger Sign-Off Block

Every ledger must close with:

```
Entropy Score: [X]
Blockers: [N] — [list or "none"]
Critical assumptions requiring confirmation: [list IDs or "none"]
Autonomous defaults active if you type go: [list IDs]
```

### Integration with DID (Section 14)

The Assumption Ledger is produced before Stage 3A/3B. Both the Architecture Planner
and Component Planner receive the human-confirmed ledger (with any corrections applied)
as part of their `architectureContext`. This ensures both planners operate from the
same resolved assumption baseline.

---

## Appendix A — Development Pipeline

### Philosophy

The orchestrator is built using the same philosophy it embodies. Claude Code and Gemini CLI operate under a strict agentic development protocol from day one — the same DID pattern, the same documentation discipline, the same human approval gate. The tool is developed using the methodology it will eventually automate.

The milestone arc:

**Phase 1 — Human-built foundation (Claude Code + Gemini CLI) [COMPLETED]**  
You build the core. Everything is manual. Claude Code proposes, Gemini reviews blind against the spec, diffs are checked before implementation. No code gets written without a task in `projecttracking.md`. Goal: a system that runs a task reliably on an external codebase.

**Phase 2 — First self-referential task [COMPLETED]**  
The orchestrator runs its first task on its own codebase. Small, low-risk. The milestone is not the task — it is the fact that the system can be trusted with itself.

**Phase 3 — Supervised self-development [IN PROGRESS]**  
You remain in the loop on every `go`. The orchestrator does meaningful work on itself. Claude Code and Gemini CLI step back.

**Phase 4 — The system is the development environment**  
New features go through the orchestrator. Bugs go through the orchestrator. You are the human approval gate, not the developer.

### Governance Documents (always current, always consulted)

| Document | Purpose |
|----------|---------|
| `AGENTS.md` | Roles, constraints, what each agent can and cannot do |
| `projecttracking.md` | Current milestone, active tasks, blocked tasks, completed |
| `SPEC.md` | The implementation contract |
| `BUGS.md` | Active bugs, severity, milestone impact |
| `CHANGELOG.md` | What shipped, when, what changed |

### Development Protocol

- No code gets written without a task in `projecttracking.md`
- Claude Code proposes implementation and writes the diff
- Diff goes to Gemini for blind review against the spec
- Gemini checks: does this match the spec, does this introduce bugs, does this break anything downstream
- Only after Gemini passes does it get implemented
- Every session ends with all governance documents updated — no exceptions
- Commits are atomic and reference the task ID from `projecttracking.md`

### Bug Protocol

- Bug found → logged in `BUGS.md` immediately with severity
- Blocking current milestone → fix now before any other task
- Not blocking → defer with a note, assigned to a future milestone
- Bug that reveals a spec gap → spec updated before the fix is written
- New feature that emerges → goes to backlog, does not interrupt current milestone unless load-bearing

### Versioning Protocol

- Every milestone has a version number
- No version bump without all milestone criteria met
- Pre-release versions: `0.x.y` — active development, breaking changes expected
- First self-referential task completion → `1.0.0`

### Milestones

**Milestone 0.1 — Environment [COMPLETED]**  
- [x] Repository initialized with governance documents
- [x] `AGENTS.md` written for this codebase
- [x] `projecttracking.md` initialized with full milestone list
- [x] Development protocol established and tested with one dummy task
- [x] Docker container builds and runs
- [x] Gate 0 checks pass on all three platforms (Mac, Linux, WSL2)

**Milestone 0.2 — Auth and Model Routing [COMPLETED]**  
- [x] CLI session detection working (Claude, Gemini, OpenAI)
- [x] Local model detection working (Ollama, LM Studio)
- [x] OpenRouter fallback working
- [x] Model routing config loads and routes correctly
- [x] All providers can complete a simple prompt round-trip

**Milestone 0.3 — State + Event Foundation [COMPLETED]**  
- [x] SQLite schema design and implementation
- [x] Event Store append-only logic
- [x] `mirrorbox.db` initialization and basic CRUD
- [x] State persistence across sessions

**Milestone 0.4A — Intelligence Graph: Tree-sitter Skeleton [COMPLETED]**
- [x] Tree-sitter Node bindings installed and functional
- [x] Target language grammars loaded
- [x] `nodes` table populated from Tree-sitter scan
- [x] `edges` table populated with static relations
- [x] `graph_query_impact` returns correct results
- [x] Incremental re-scan works
- [x] MCP server exposes `graph_search` and `graph_query_impact`
- [x] `graphCompleteness` flag implemented

**Milestone 0.4B — Intelligence Graph: LSP Enrichment [COMPLETED]**
- [x] LSP client library integrated
- [x] Language server auto-detection
- [x] `edges` table enriched with `CALLS` relations
- [x] Cross-file import resolution working
- [x] Full MCP server: all five tools operational

**Milestone 0.5 — callModel + Firewall [COMPLETED]**  
- [x] Unified `callModel` function implementation
- [x] XML-based `<PROJECT_DATA>` tagging system
- [x] System directive enforcement
- [x] Prompt injection heuristic detection

**Milestone 0.6 — Operator + Session [COMPLETED]**  
- [x] Operator initializes and persists across tasks
- [x] Classification produces valid `Classification` objects
- [x] Context window management triggers and summarizes correctly
- [x] Session handoff writes and reads correctly
- [x] `AGENTS.md` detection and injection working

**Milestone 0.7 — DID Pipeline (no execution) [COMPLETED]**  
- [x] Stage 1–5 implementation
- [x] Gate 1 comparison logic works
- [x] Gate 2 comparison logic works
- [x] Tiebreaker fires correctly
- [x] Human approval gate displays correctly and requires `go`

**Milestone 0.8 — Sandbox [COMPLETED]**
- [x] Docker-in-Docker sandbox spawns and tears down
- [x] Runtime instrumentation collects traces
- [x] Pre/post patch comparison runs
- [x] Regression detection halts pipeline
- [x] Runtime edges update Intelligence Graph

**Milestone 0.9 — Execution + Git [COMPLETED]**  
- [x] Patch generator writes files within approved scope only
- [x] Git branch created, BaseHash verified, 3-way merge applied
- [x] Structural verification runs and aborts on failure
- [x] Automatic rollback on failure
- [x] First real task executed on a real codebase end-to-end

**Milestone 0.10 — Onboarding [COMPLETED]**  
- [x] Four fixed questions presented in order
- [x] Silent scan runs after Q4
- [x] Targeted follow-up questions generated
- [x] Prime directive synthesized and stored
- [x] All outputs generated and confirmed before write

**Milestone 0.11 — VS Code Extension [COMPLETED]**  
- [x] Extension renders panels correctly
- [x] Wire protocol events consumed and displayed
- [x] Approval gate works inside VS Code

**Milestone 1.0 — Self-referential [COMPLETED]**  
- [x] Orchestrator runs its first task on its own codebase
- [x] Task completes successfully
- [x] All invariants hold
- [x] External invariant test suite passes
- [x] **Sovereign Loop (1.0-09)**: MBO patches its own `src/index.js` and promotes to `MBO_Alpha`.
- [x] **Assumption Ledger (1.0-10)**: Section 27 protocol implemented and enforced.

---

## Appendix B — Platform Strategy

... [rest of spec]

---

## Section 28 — CLI Entrypoint and Project Portability

### 28.1 — The `mbo` Command

MBO is installed globally via npm:

```bash
npm install -g mbo
```

Registers two binaries via `package.json` `bin` field:

| Command | Executable | Purpose |
|---------|-----------|---------|
| `mbo` | `bin/mbo.js` | Stable release |
| `mboalpha` | `bin/mbo.js` | Alpha/dev build — removed when alpha graduates |

Both resolve project root from `process.cwd()`. MBO never assumes its own source directory is the project being worked on.

**Edge case — subdirectory invocation:** MBO walks up the directory tree looking for an existing `.mbo/` folder. If found in a parent, uses that as project root and notifies the user. If not found, treats `cwd` as project root.

**Edge case — two versions installed:** `mbo` and `mboalpha` are separate global installs. Each resolves to its own binary. `.mbo/onboarding.json` records the MBO version that performed onboarding — version mismatch triggers re-onboard.

---

### 28.2 — Machine-Level Config (`~/.mbo/`)

Machine-level config lives in `~/.mbo/config.json`. Never written to any project. Per-user.

```json
{
  "operator":   { "provider": "google",      "model": "gemini-2.5-flash" },
  "planner":    { "provider": "claude-cli",  "model": "claude-sonnet-4-6" },
  "reviewer":   { "provider": "claude-cli",  "model": "claude-sonnet-4-6" },
  "tiebreaker": { "provider": "claude-cli",  "model": "claude-opus-4-6" },
  "executor":   { "cli": "claude" },
  "devServer":  "npm run dev",
  "createdAt":  "2026-03-11T00:00:00.000Z",
  "updatedAt":  "2026-03-11T00:00:00.000Z"
}
```

API keys are never written to `config.json`. They live exclusively in shell environment variables. If the user provides a key during `mbo setup`, MBO appends `export KEY="value"` to `~/.zshrc` or `~/.bashrc` — skipped if already present, non-fatal if write fails.

**Edge case — corrupt config:** Renamed `config.json.corrupt.{timestamp}`, setup re-runs. Original never deleted.

**Edge case — Docker/CI:** `~/.mbo/` not mounted. All config via `process.env`. MBO detects non-TTY (`process.stdout.isTTY === false`) and exits with a descriptive error listing missing config rather than blocking on a prompt.

**Edge case — non-bash/zsh shell:** MBO prints the export statement to the terminal with manual-add instructions. Does not attempt to write to unknown shell config files.


---

### 28.3 — Project-Level Data (`.mbo/`)

```
{projectRoot}/
  .mbo/
    mirrorbox.db        — gitignored — graph, event store, audit trail (per-user)
    onboarding.json     — committed  — shared project profile
    AGENTS.md           — committed  — agent rules for this project
    BUGS.md             — committed  — active bugs
    CHANGELOG.md        — committed  — shipped changes
    logs/               — gitignored
    sessions/           — gitignored
```

On first run MBO writes to `.gitignore` (creates if absent):

```gitignore
# MBO — per-user data (not committed)
.mbo/
!.mbo/onboarding.json
!.mbo/AGENTS.md
!.mbo/BUGS.md
!.mbo/CHANGELOG.md
```

**Edge case — `.gitignore` already has `.mbo/`:** Checks before writing. Appends only missing negation entries.

**Edge case — not a git repo:** Skips `.gitignore` manipulation, logs warning, creates `.mbo/` normally.

**Edge case — `mirrorbox.db` accidentally committed:** MBO warns and offers `git rm --cached .mbo/mirrorbox.db`. Does not execute automatically.

---

### 28.4 — Auditability

Each user's `mirrorbox.db` is their personal audit trail. Team members never share a database. The shared source of truth is `onboarding.json` and the governance docs committed to `.mbo/`.

---

### 28.5 — Launch Sequence

```
1. Walk up directory tree for existing .mbo/
   → Found in parent: use that root, notify user
   → Not found: use cwd

2. Check ~/.mbo/config.json
   → Missing or corrupt: run mbo setup inline, then continue
   → Found: load config

3. Detect providers (CLI tools, env vars, Ollama)
   → No executor CLI and no API key: exit with instructions
   → CLI only (no API key): warn, continue

4. Check .mbo/ in project root
   → Not found: run Tokenizer onboard (Section 29), create .mbo/
   → Found, version matches: resume → operator
   → Found, version mismatch: re-onboard with prior answers as defaults

5. Start operator
```

**Edge case — onboarding interrupted:** Missing or empty `onboarding.json` restarts onboarding from the beginning. No partial-state resume.

**Edge case — version downgrade:** Warns but does not block. Unknown fields ignored, missing fields use defaults.

---

### 28.6 — `mbo setup`

Run standalone (`mbo setup`) or inline on first launch.

| Item | Storage |
|------|---------|
| OpenRouter API key | `~/.zshrc` / `~/.bashrc` as `export` |
| Anthropic API key | `~/.zshrc` / `~/.bashrc` as `export` |
| Claude CLI auth | Detected only — user manages via `claude` CLI |
| Gemini CLI auth | Detected only — user manages via `gemini` CLI |
| Ollama URL | `~/.mbo/config.json` |
| Model role assignments | `~/.mbo/config.json` |
| Dev server command | `~/.mbo/config.json` |

Comparison table defaults to configured models. User can add any OpenRouter model. At least one executor CLI required — setup exits with install instructions if none detected.

---

### 28.7 — Team Onboarding Flow

1. New team member clones project with committed `onboarding.json`
2. Runs `mbo` — setup runs inline if `~/.mbo/config.json` missing
3. MBO detects existing `onboarding.json` — presents prior answers as defaults
4. User confirms or updates — `onboardingVersion` increments
5. Personal `mirrorbox.db` built locally from confirmed profile
6. Audit trail begins fresh

**Edge case — concurrent `onboarding.json` updates:** File is committed — git handles merge. Conflicts are a team conversation, not a system problem.

---

### 28.8 — DB Path Resolution

```js
const PROJECT_ROOT = process.env.MBO_PROJECT_ROOT || process.cwd();
const DEFAULT_DB_PATH = path.join(PROJECT_ROOT, '.mbo', 'mirrorbox.db');
```

`MBO_PROJECT_ROOT` is an override for Docker, testing, and self-referential use (Section 26 — Mirror/Subject worlds never share a database).


---

## Section 29 — Tokenizer (Onboarding Intelligence Module)

### 29.1 — What Tokenizer Is

Tokenizer is the onboarding intelligence layer of MBO. It scans a codebase, asks the onboarding questions, produces the spec and `onboarding.json`, and measures the token economics of the project continuously — showing what the codebase costs to load with MBO vs. without MBO.

Tokenizer is designed from inception to be extracted as a standalone product. Its value — "your codebase costs X, here's what you'd save" — is legible without any other part of MBO installed. MBO depends on Tokenizer. Tokenizer does not depend on MBO.

See `/Users/johnserious/tokenizer/SPEC.md` for the full standalone product spec.

---

### 29.2 — Tokenizer's Three Functions

**1. Scan** — Measure what the codebase costs to load against a standard tokenizer. No DB, no model. Runs offline in seconds. This is the free tier.

**2. Onboard** — Run the onboarding interview, analyze the codebase, produce `onboarding.json`. Requires a frontier model (see 29.4). This is Section 5's engine.

**3. Track** — Store the raw baseline (captured once at first run, immutable) and compute the with/without delta on every subsequent run.

Tokenizer does NOT handle CLI detection, model role assignment, or API key collection. That is `mbo setup` (Section 28.6). Tokenizer runs first. Setup runs after.

---

### 29.3 — The With/Without Model

Savings is a continuous **with Tokenizer vs. without Tokenizer** measurement, not a before/after point in time. As the codebase grows, raw cost grows. The delta compounds.

- **Baseline** — token count of every git-tracked file, captured at first `token onboard`, stored in `mirrorbox.db` as `token_baseline`. Immutable. Never overwritten.
- **Current raw** — recalculated every session. Full repo token cost as-is, unstructured.
- **MBO-loaded** — tokens actually consumed this session, from the event store.
- **Savings delta** = `current_raw − mbo_loaded`

```
Your repo is currently 4.1M tokens to load raw.
This session MBO loaded 340K tokens.
You saved 3.76M tokens this session.
```

---

### 29.4 — Model Selection for Onboarding Interview

| Priority | Model | Reason |
|----------|-------|--------|
| 1 | `claude-sonnet-4-6` | Best detail orientation, lowest opinion bleed |
| 2 | `gemini-2.5-pro` | Acceptable — weaker on detail |
| 3 | Any via OpenRouter | User-configured fallback |

Scan and Track require no model. Only Onboard hits a model.

---

### 29.5 — Tokenizer Commands

```
token scan       — scan repo, print token count + cost table (no DB, no model)
token onboard    — full onboarding interview → onboarding.json
token status     — show baseline, current raw, with/without delta
token export     — print session token accounting as JSONL to stdout
```

When invoked via MBO's launch sequence, `token onboard` is called automatically.

---

### 29.6 — Tokenizer

Uses `cl100k_base` (tiktoken) as the standard tokenizer for all stored measurements — not because every model uses it, but because it produces a stable cross-model-comparable number. Conversion to model-specific dollar costs happens at display time using live pricing from OpenRouter.


---

## Section 30 — Token Accounting

### 30.1 — Purpose

Every model call in MBO emits token usage into the event store. Token accounting is not optional and cannot be disabled. It serves two functions: live session awareness and the with/without delta calculation (Section 29.3).

---

### 30.2 — Event Schema Extension

Every `callModel` invocation appends a `TOKEN_USAGE` event:

```json
{
  "event": "TOKEN_USAGE",
  "stage": "PLANNER",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "tokensIn": 12400,
  "tokensOut": 840,
  "tokensTotal": 13240,
  "costUsd": 0.0496,
  "sessionTotal": 38200,
  "sessionCostUsd": 0.1432,
  "ts": "2026-03-11T22:00:00.000Z"
}
```

`costUsd` is null for Ollama and unknown OpenRouter slugs — displayed as `—` in the UI. `sessionTotal` and `sessionCostUsd` are running accumulators, reset at session start.

---

### 30.3 — Pricing Data

Pricing is fetched live from OpenRouter `/api/v1/models` at session start and cached in memory. Fallback hardcoded rates (subject to change — live rates always take precedence):

| Model | Input /1M | Output /1M |
|-------|-----------|------------|
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-opus-4-6 | $5.00 | $25.00 |
| claude-haiku-4-5 | $1.00 | $5.00 |
| gemini-2.5-pro | ~$1.25 | ~$10.00 |
| gemini-2.5-flash | ~$0.15 | ~$0.60 |
| gpt-5.2 | $1.75 | $14.00 |
| deepseek-v3.2 | $0.14 | $0.28 |
| ollama (local) | $0.00 | $0.00 |

---

### 30.4 — UI Surface

**Stage 1.5 sign-off block** (before human types `go`):
```
Entropy Score: 4.5  |  Blockers: none
Session tokens: 38,200  |  Session cost: $0.14
Repo raw cost: $47.20/session  |  MBO savings this session: $40.80
```

**Session end summary:**
```
── Session Summary ───────────────────────────────
Tasks completed:    2
Total tokens used:  142,300
Session cost:       $0.53  (claude-sonnet-4-6)
Repo raw cost:      $47.20
Tokens saved:       3.76M  |  Savings: $40.67
─────────────────────────────────────────────────
```

**`token status` command:**
```
Baseline (captured 2026-03-01):  4,420,000 tokens
Current raw:                     4,100,000 tokens
This session loaded:               340,000 tokens
Savings this session:            3,760,000 tokens
```

---

### 30.5 — Cost Comparison Table

The comparison table defaults to models in `~/.mbo/config.json`. Users can add any OpenRouter model. MBO's in-house defaults ship as out-of-the-box defaults before any config exists. Prices fetched live from OpenRouter — table updates when pricing changes.

```
Savings this session: 3,760,000 tokens

  Model                  Saved        Rate (input /1M)
  ─────────────────────────────────────────────────────
  Gemini 2.5 Flash       $0.56        $0.15
  DeepSeek V3.2          $0.53        $0.14
  GPT-5.2                $6.58        $1.75
  Claude Sonnet 4.6      $11.28       $3.00
  Claude Opus 4.6        $18.80       $5.00
```

---

### Section Changes

- **Section 5 (Onboarding):** Tokenizer is the engine. Section 5 describes the onboarding contract. Section 29 describes the implementation.
- **Section 15 (Stage 1.5):** Sign-off block gains `Session tokens` and `MBO savings` lines per 30.4.
- **Section 13 (HardState):** `sessionTokens` and `sessionCostUsd` added as tracked fields, reset on session start, incremented by every `callModel` call.
- **Section 3 (Deployment):** Docker config — all model config and API keys via `docker run -e` or `--env-file`. `~/.mbo/` not mounted. Non-TTY detection prevents setup wizard from blocking.

