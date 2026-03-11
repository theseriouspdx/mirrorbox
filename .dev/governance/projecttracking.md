# projecttracking.md
## Mirror Box Orchestrator — Build Tracking

**Current Milestone:** 1.1 — Portability & Tokenizer [IN PROGRESS]
**Next Action:** 1.1-03 — Implement mbo setup wizard

---

## NEXT ACTION

**Task 1.1-03 — Implement `mbo setup` wizard**

Goal: When `mbo` is run and `~/.mbo/config.json` does not exist, run the setup wizard inline before proceeding. Also callable standalone as `mbo setup`.

What it does:
1. Scans system for available CLI tools (claude, gemini, codex) via `which`
2. Queries Ollama at `localhost:11434/api/tags` for local models (2s timeout, non-fatal)
3. Reads `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY` from `process.env`
4. If keys missing, prompts user to enter them (skip with Enter)
5. If keys provided, appends `export KEY="value"` to `~/.zshrc` or `~/.bashrc` (skip if already present, non-fatal if write fails)
6. Builds recommended config using priority rules (see Section 28.2 and orchestrator/src/config.ts for reference)
7. Presents recommended config, asks Y/n to accept
8. If Y: saves to `~/.mbo/config.json`, done
9. If N: steps through each role (operator, planner, reviewer, tiebreaker, executor) with numbered option list
10. Saves final config to `~/.mbo/config.json`
11. Optionally collects dev server command (e.g. `npm run dev`)

Files to create:
- `src/cli/setup.js` — wizard logic (MUST stay under 250 LOC, CC ≤ 10, nesting ≤ 4)
- Split into sub-modules if needed: `src/cli/detect-providers.js`, `src/cli/shell-profile.js`

Files to modify:
- `src/index.js` — add check at top of `main()`: if `~/.mbo/config.json` missing, import and run setup before operator starts
- `bin/mbo.js` — add `mbo setup` subcommand detection: if `process.argv[2] === 'setup'`, run setup directly and exit

Reference implementation (working wizard in TypeScript):
`/Users/johnserious/orchestrator/src/config.ts` — full provider detection, wizard UI, shell profile writer. Port the logic to CJS JavaScript.

Non-TTY guard: if `process.stdout.isTTY === false`, skip wizard and exit with error listing missing config. Never block in CI/Docker.

Config schema (save to `~/.mbo/config.json`):
```json
{
  "operator":   { "provider": "google",     "model": "gemini-2.5-flash" },
  "planner":    { "provider": "claude-cli", "model": "claude-sonnet-4-6" },
  "reviewer":   { "provider": "claude-cli", "model": "claude-sonnet-4-6" },
  "tiebreaker": { "provider": "claude-cli", "model": "claude-opus-4-6" },
  "executor":   { "cli": "claude" },
  "devServer":  "",
  "createdAt":  "<ISO timestamp>",
  "updatedAt":  "<ISO timestamp>"
}
```

Show plan before writing any code.

---

## MILESTONE 0.8 — Sandbox [COMPLETED]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 0.8-01 | Create Docker-in-Docker sandbox container | COMPLETED |
| 0.8-02 | Implement sandbox spawn/teardown logic | COMPLETED |
| 0.8-03 | Implement pre/post patch comparison logic | COMPLETED |
| 0.8-04 | Implement regression detection loop | COMPLETED |
| 0.8-05 | Implement runtime trace collection | COMPLETED |
| 0.8-06 | Implement runtime edge update logic | COMPLETED |
| 0.8-07 | Implement Runtime Edge enrichment for Intelligence Graph | COMPLETED |
| 0.8-08 | Implement BUG-013: CLI sandbox interaction (focus ctrl+f) | COMPLETED |

---

## MILESTONE 0.9 — Sovereign Factory [COMPLETED]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 0.9.1 | Implement bin/handshake.py & bin/validator.py | COMPLETED |
| 0.9.2 | Constitutional Sync & Day Zero Baseline | COMPLETED |

---

## MILESTONE 1.0 — Production Alpha [IN PROGRESS]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 1.0-01 | Global Integrity & Bug-Fix Patch (BUG-009, BUG-037) | COMPLETED |
| 1.0-02 | Initialize Subject World (Target Codebase) logic | COMPLETED |
| 1.0-03 | The Relay — UDS cross-world telemetry (Subject → Mirror EventStore) | COMPLETED |
| 1.0-04 | The Pile — Promotion engine (Mirror → Subject, Merkle-validated) | COMPLETED |
| 1.0-05 | The Guard — Relay integrity gatekeeper (scope + chain validation) | COMPLETED |
| 1.0-06 | Stage 6/7/8 wiring — handshake.py writes, validator.py, test runner | COMPLETED |
| 1.0-07 | Subject World graph routing — Stage 2 routes by world_id to correct DB | COMPLETED |
| 1.0-08 | External Invariant Test Suite — black-box, all Section 22 invariants | COMPLETED |
| 1.0-09 | Sovereign Loop — MBO patches itself end-to-end (1.0 close condition) | COMPLETED |
| 1.0-10 | Stage 1.5 Assumption Ledger — implement Section 27 protocol in operator.js pipeline | COMPLETED |
| 1.0-MCP-01 | MCP Layer 1: Fix signal trap stderr redirect + close fd 3 (BUG-049) | COMPLETED |
| 1.0-MCP-02 | MCP Layer 2: EPIPE guard in mcp-server.js | COMPLETED |
| 1.0-MCP-03 | MCP Layer 3: Startup sentinel file (.dev/run/mcp.ready) | COMPLETED |
| 1.0-MCP-04 | MCP Layer 4: launchd plist (com.mbo.mcp) | COMPLETED |
| 1.0-MCP-05 | MCP Layer 5: Transparent session recovery on stale session-id | COMPLETED |

---

## MILESTONE 1.0 — Production Alpha [COMPLETED]
*Closed: 2026-03-11. All tasks completed. Sovereign loop verified.*

---

## MILESTONE 1.1 — Portability & Tokenizer [IN PROGRESS]
| Task ID | Task Description | Status |
|---------|------------------|--------|
| 1.1-01 | Fix BUG-051: DBManager DB path resolution (Section 28.8) | COMPLETED |
| 1.1-02 | Fix BUG-052: Create bin/mbo.js launcher + package.json bin entries (Section 28.1) | COMPLETED |
| 1.1-03 | Implement mbo setup wizard — ~/.mbo/config.json, provider detection (Section 28.6) | OPEN |
| 1.1-04 | Implement .mbo/ project init — directory walk, .gitignore guard (Section 28.3) | OPEN |
| 1.1-05 | Implement launch sequence — version check, re-onboard trigger (Section 28.5) | OPEN |
| 1.1-06 | Fix BUG-050: Validator failure halts pipeline, re-enters Stage 3A (Section 28) | OPEN |
| 1.1-07 | Implement Tokenizer module — scan, onboard, track (Section 29) | OPEN |
| 1.1-08 | Implement token accounting — event schema, live tally, session summary (Section 30) | OPEN |
| 1.1-09 | Wire Tokenizer into MBO launch sequence as onboarding engine | OPEN |
