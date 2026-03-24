# NEXT_SESSION.md — 2026-03-23 (session wrap)

## Session Start Block

```
Read .dev/sessions/NEXT_SESSION.md
Then run: node scripts/graph_call.js graph_server_info
Then run: git status --short
Report: graph index age, uncommitted changes, and confirm you understand the outstanding tasks before doing anything.
Do not start any work until confirmed.
```

---

## What Was Done This Session

### DID Correction Sprint — v1.1.01–v1.1.05 COMPLETED
(Task IDs still read `v1.0.x` in projecttracking.md — renaming to `v1.1.x` is FIRST TASK next session.)

| Task | Title | Status |
|------|-------|--------|
| v1.0.01 → v1.1.01 | Config: missing roles (classifier, patchGenerator, onboarding) migrated to .mbo/config.json; patchGenerator added to setup.js | COMPLETED |
| v1.0.02 → v1.1.02 | DID Gate 2: `_runGate2()` implemented in did-orchestrator.js — blind code consensus, 4B/4C/4D stages | COMPLETED |
| v1.0.03 → v1.1.03 | DID rounds 3–4: dialogue loop removed; replaced with `_runGate1Tiebreaker()` → `_runStage4A()` chain | COMPLETED |
| v1.0.04 → v1.1.04 | Stage 4.5: real dry-run implemented in operator.js (backup→apply→validate→restore with finally{}) | COMPLETED |
| v1.0.05 → v1.1.05 | Stage 10: smoke test added to operator.js + App.tsx; MAX_SMOKE_RETRIES=2; pendingSmoke state | COMPLETED |

### DDR-005 Universal Agent Mandate
- `ADVERSARIAL_MANDATE` updated in `src/auth/did-prompts.js` with failure-mode-first requirement
- `CLAUDE.md` created at repo root — section 2 contains Universal Agent Mandate (applies to Claude Code, Codex, Gemini)

### Session Audit Infrastructure
- `.dev/governance/SESSION_AUDIT_PROMPT.md` — reusable session-start audit template (311 lines)

### Governance Restructure (committed f29bb2d)
- Session handoff files removed from `governance/` → now live in `sessions/` and `sessions/archive/`
- Stale artifacts archived: `assumption-ledger-h29.md`, `tokenmiser-semantics-v0.2.05.md`
- 12 auto-generated HANDOFF_20260323_* files removed from git

---

## Outstanding — Must Do First Next Session

### 1. Rename v1.0.x → v1.1.x in projecttracking.md
All correction sprint task IDs were created as `v1.0.x` but belong in the `v1.1.x` lane (current milestone is `1.1 — Portability & Hardening`). Rename 01–09 across the whole file.

### 2. Mark v1.1.01–v1.1.05 COMPLETED in projecttracking.md
Owner: claude, Updated: 2026-03-23

### 3. Fix package.json version
Current: `"0.3.24"` (plain — wrong)
Correct: `"0.3.24_0.2.09_1.1.05"`
Convention: AGENTS.md §17E — underscore-separated compound tag.
Primary (left) = highest active series. Compound (right) = co-released series high-water tasks.

### 4. Commit version + projecttracking fix
Single commit. Message: `chore(governance): v0.3.24_0.2.09_1.1.05 — rename v1.0.x→v1.1.x, mark 01-05 complete`

### 5. Uncommitted change: src/tui/governance.ts
`GovernanceSummary` interface + `parseHeaderValue`, `countTaskRows`, `isBootstrapGovernance` functions were added but never committed. Verify these are correct and commit, or revert if they were a draft.

---

## Remaining Correction Sprint Tasks (v1.1.06–v1.1.09)

| Task | Title | Priority |
|------|-------|----------|
| v1.1.06 | Vendor diversity enforcement: mbo setup warns if planners + reviewer are same vendor | P2 |
| v1.1.07 | readOnlyWorkflow disposition: spec it or remove it | P2 |
| v1.1.08 | Audit gate timing: move before writes or document divergence explicitly | P2 |
| v1.1.09 | Convergence detection: replace syntactic line-intersection with qualitative assessment | P2 |

---

## Outstanding Doc Cleanup Task (its own session)

A dedicated doc cleanup session is needed for:
- **CHANGELOG.md full reconstruction** — missing the vast majority of historical changes
- **§17E format unification** — CHANGELOG currently uses `+`/`.` separators; AGENTS.md §17E mandates `_`. All existing entries need normalizing to `_` format.
- **spec/ directory duplicates** — `SPEC.corrupt.*` and `SPEC.v1.*` exist in both `spec/` and `archive/spec-history/`; `mbo-mcp-hardening-requirements.*` exists in both `spec/` and `archive/preflight-superseded/`
- **NEXT_SESSION.md reference in CLAUDE.md** — currently points to `governance/NEXT_SESSION.md`; update to `sessions/NEXT_SESSION.md`

Add a `v0.doc.01` (or similar) task to projecttracking.md for this work.

---

## Key File Locks

All `src/auth/` files are `chmod 444`. Require `chmod 600` before editing, `chmod 444` after.

```
src/auth/did-prompts.js       444 — 10 exported prompt builders incl. Gate 1 + Gate 2
src/auth/did-orchestrator.js  444 — _runGate1Tiebreaker, _runStage4A, _runGate2, run, _package
src/auth/operator.js          444 — runStage4_5 (real dry-run), runStage10, handleSmokeVerdict
src/auth/model-router.js      444 — BUG-143 shim DEPRECATED as of v1.1.01
src/cli/setup.js              444 — patchGenerator added to all config paths
src/tui/App.tsx               444 — smokePending state + smoke dispatch block
```

---

## Governance Directory — Current Clean State

```
.dev/governance/
  AGENTS.md              Living agent protocol
  BUGS.md                Active bugs
  BUGS-resolved.md       Resolved bugs
  CHANGELOG.md           (⚠ incomplete — doc cleanup task pending)
  DESIGN_DECISIONS.md    Architecture decisions
  DID-PROTOCOL.pdf       DID reference doc
  SESSION_AUDIT_PROMPT.md  ← Reusable session-start audit template
  TECHNICAL_DEBT.md      Tech debt register
  complexity.toml        Complexity policy
  imports.allow          Import allowlist
  nhash                  Hash file
  overrides/             Override logs
  projecttracking.md     Task ledger

.dev/sessions/
  NEXT_SESSION.md        ← This file (current handoff)
  archive/               Old handoffs
```

---

## Versioning Reference

**Convention (AGENTS.md §17E):** `PRIMARY_COMPOUND` with `_` separators
**Target for next session:** `0.3.24_0.2.09_1.1.05`
- `0.3.24` = highest active base series (v0.3 lane, task 24)
- `0.2.09` = co-released v0.2 lane high-water (Tokenmiser counterfactual fix)
- `1.1.05` = co-released v1.1 lane high-water (DID correction sprint, tasks 01–05)

---

*Written: 2026-03-23 — end of DID correction sprint + governance restructure session*
