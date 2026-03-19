# Governance Collapse — Session Handoff B
## 2026-03-18 | Status: COLLAPSE-01, COLLAPSE-02, COLLAPSE-04 COMPLETE

---

## What Happened This Session

Three-agent DID (Gemini prompt provided, Agent A = handoff draft, Agent B = Claude
blind derivation, Agent C = Codex paste) on COLLAPSE-01. Reconciliation produced
7 divergences — all Codex additions adopted. Full reconciliation table archived in
this session's chat history.

COLLAPSE-01, COLLAPSE-02, and COLLAPSE-04 were written and committed to disk.

---

## What Was Written

### COLLAPSE-01 — `.dev/governance/AGENTS.md` v1.1
- Path: `/Users/johnserious/MBO/.dev/governance/AGENTS.md`
- 370 lines
- All six conflict resolutions applied (C1–C6)
- Codex divergences adopted: Inv 18 adds STATE.md as agent read surface,
  Codex row added to agent table, 6B sync targets flexible, 6C writes STATE.md,
  Section 10 MCP restart sentence dropped, Section 16 DDR/debt/STATE policy added

### COLLAPSE-02 — STATE.md format + session-close write
- Format spec: `/Users/johnserious/MBO/.dev/governance/STATE_FORMAT.md`
- `mbo-session-close.sh` now writes `.mbo/STATE.md` after NEXT_SESSION.md
- STATE.md is status surface only — no design decisions, no policy

### COLLAPSE-04 — NEXT_SESSION.md path consolidation
- Canonical write: `.mbo/sessions/NEXT_SESSION.md`
- Symlinks at old paths: `NEXT_SESSION.md` (root), `.dev/sessions/NEXT_SESSION.md`,
  `data/NEXT_SESSION.md` — all point to canonical
- `.mbo/sessions/` directory created
- Full curl MCP block (~45 lines, lines 247–291 of original) replaced with:
  `node scripts/mcp_query.js --diagnose graph_server_info`
- `NEXT_CANONICAL` variable added; old `NEXT_ROOT` write target updated

### projecttracking.md
- COLLAPSE-01, COLLAPSE-02, COLLAPSE-04 added to Recently Completed

---

## Conflict Resolutions — All Locked, All Applied

- C1: Invariant 17 = Worktree-Isolated (full git worktree add protocol)
- C2: Invariant 18 = DB Write Prohibition; old Inv 18/19/20 removed
- C3: MCP health check = mcp_query.js --diagnose everywhere; curl removed
- C4: DDR-001/002/003 → task in projecttracking + normative in SPEC.md; STATE.md status only
- C5: TECHNICAL_DEBT.md actionable items → BUGS.md; file → .dev/archive/
- C6: NEXT_SESSION.md canonical = .mbo/sessions/NEXT_SESSION.md

---

## What The Next Agent Should Do

### Gate 0 validation (do this first)
```
python3 bin/validator.py --all
```
Expected: clean pass. If failures, fix before proceeding.

### COLLAPSE-05 — Invariant renumbering (Backlog — do not start yet)
Gaps: 1–9, then 14, then 18. Before touching anything, grep:
- `docs/agent-onboarding.md` — references "Invariant 14"
- `src/templates/AGENTS.md` — references Invariants 13, 15, 16
- `CHANGELOG.md` — historical references (leave untouched — immutable history)

### COLLAPSE-03 — Generated client AGENTS.md (Deferred)
`src/templates/AGENTS.md` is the source template for `.mbo/AGENTS.md` shipped to
client projects. Was NOT part of this collapse analysis. Read it before starting.

### Active task queue (from projecttracking.md)
- `v0.11.86` IN_PROGRESS — BUG-086 root-mismatch re-onboarding validation round 2
- `v0.11.61` READY — BUG-061 Merkle scope + MCP query path drift closure
- `v0.11.52` READY — BUG-052 global mbo CLI entrypoint packaging
- `v0.11.36` IN_PROGRESS — workflow canonicalization and validator enforcement

---

## Known Issues / Watch Items

### src/templates/AGENTS.md — not yet reviewed
Contains its own invariant structure (Inv 13/15/16 visible). Not part of this
collapse. COLLAPSE-03 owns it. Do not conflate with `.dev/governance/AGENTS.md`.

### C5 not fully executed
TECHNICAL_DEBT.md items need to be migrated to BUGS.md and the file moved to
`.dev/archive/`. Was not done this session — needs a task entry before execution.

### validator.py drift checks
v0.11.36 (IN_PROGRESS) includes validator enforcement for NEXT_SESSION.md staleness
and P0/P1 bug linkage. The new canonical path `.mbo/sessions/NEXT_SESSION.md` needs
to be reflected in validator.py's stale-check logic if it hardcodes old paths.

---

## Files Modified This Session

- `/Users/johnserious/MBO/.dev/governance/AGENTS.md` — rewritten (COLLAPSE-01)
- `/Users/johnserious/MBO/.dev/governance/STATE_FORMAT.md` — created (COLLAPSE-02)
- `/Users/johnserious/MBO/.dev/governance/projecttracking.md` — 3 tasks added
- `/Users/johnserious/MBO/scripts/mbo-session-close.sh` — 4 edits (COLLAPSE-02+04)
- `/Users/johnserious/MBO/.mbo/sessions/` — directory created (COLLAPSE-04)

---

*Written: 2026-03-18 — end of collapse session*
*Next session: run validator.py --all, then pick up v0.11.86 or v0.11.36*
