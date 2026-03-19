# Governance Collapse — Session Handoff C
## 2026-03-18 | Status: COLLAPSE-03, C5 COMPLETE — COLLAPSE-05 BLOCKED pending scope expansion

---

## What Happened This Session

Continued from COLLAPSE_HANDOFF_20260318b.md. This session completed:
- Gate 0 validator fix (NEXT_SESSION.md canonical path in validator.py)
- C5: TECHNICAL_DEBT.md migration to BUGS.md + archive
- COLLAPSE-03: src/templates/AGENTS.md sync to governance v1.1
- COLLAPSE-05 scoping — determined it cannot execute as written (see below)

---

## What Was Done This Session

### validator.py — NEXT_SESSION path fix
- `bin/validator.py` line 14: `.dev/sessions/` → `.mbo/sessions/NEXT_SESSION.md`
- `.mbo/sessions/NEXT_SESSION.md` bootstrapped (canonical path now live)
- `python3 bin/validator.py --all` → exit 0

### C5 — TECHNICAL_DEBT.md migration (task v0.11.91)
- Invariant 13 backup: `.dev/bak/governance/TECHNICAL_DEBT.md`
- BUGS.md: BUG-131 (OpenAI CLI unverified, OPEN), BUG-132 (Ollama, RESOLVED — external
  validation passed on separate machine), BUG-134 (model selection hardcoded across
  all backends, OPEN) appended
- TECHNICAL_DEBT.md moved → `.dev/archive/governance-artifacts/TECHNICAL_DEBT.md`
- BUG-133 not written — superseded by BUG-134 (generalized form)
- Validator clean after

### COLLAPSE-03 — src/templates/AGENTS.md sync (task v0.11.92)
- DID executed: Claude derivation + other agent derivation + reconciliation
- Reconciliation rulings applied:
  - R1: Section 1 uses `.mbo/projecttracking.md` not `.mbo/STATE.md`
  - R2: Decision log in HTML comment block only, not as visible Section 11
  - R3: MCP graph context section added (adopted from other agent)
  - R4: Two stale paths fixed in docs/agent-onboarding.md (lines 26 + 158)
  - R5: BUG-135 logged (init-project.js stub gap)
  - R6: Owner = claude, branch = claude/collapse-03
- Invariant 13 backup: `.dev/bak/src/templates/AGENTS.md`
- src/templates/AGENTS.md rewritten: Invariants 14, 17, 18 added; controller-only
  sections excluded; NEXT_SESSION canonical path updated throughout
- docs/agent-onboarding.md: both stale NEXT_SESSION.md paths fixed
- BUG-135 appended to BUGS.md
- Validator clean after

---

## COLLAPSE-05 — Why It Is Blocked

### The problem
COLLAPSE-05 as written in the backlog says:
> "Renumber AGENTS.md invariants to eliminate gaps (1-9, 14, 18)"
> Known cross-references: docs/agent-onboarding.md (Inv 14), src/templates/AGENTS.md (Inv 13/15/16)

This underestimates the actual cross-reference surface. A grep of the full codebase found
invariant references by number throughout production source:

Files with hardcoded invariant numbers (production src/):
- `src/auth/call-model.js` — Invariant 6, 7 (FIREWALL_VIOLATION error strings)
- `src/auth/operator.js` — Invariant 7, 13 (checkpoint comments)
- `src/auth/did-orchestrator.js` — Invariant 13
- `src/state/event-store.js` — Invariant 4, 8, 10
- `src/state/state-manager.js` — Invariant 13
- `src/state/redactor.js` — Invariant 8
- `src/graph/graph-store.js` — Invariant 7
- `src/sandbox/sandbox-manager.js` — Invariant 10
- `scripts/test-invariants.js` — Invariants 1, 2, 4, 10, 11
- `scripts/verify-chain.js` — Invariant 4
- `scripts/test-redactor.js`, `test-redactor-v2.js` — Invariant 8
- `docs/invariant-audit.md` — Invariant 1
- All worktree copies of the above

Renumbering governance docs without updating these source comments = documentation
integrity failure. Renumbering the source comments = multi-file src/ task requiring
handshake, Tier 2 routing, and a dedicated session.

### What needs to happen before COLLAPSE-05 can execute

1. COLLAPSE-05 backlog entry in projecttracking.md needs its acceptance criteria
   expanded to include: "all src/ and scripts/ invariant number references updated
   to match new sequential numbering; worktree copies are derived from main branch
   so they update automatically on merge"

2. A new task entry (not backlog) must be created for the actual implementation
   with the full src/ scope declared, a handshake obtained, and a worktree created.

3. The renumbering scheme must be decided first:
   Current numbering: 1-9, 10-13, 14, 15-17, 18 (with gaps at original 14, 15-17 pos)
   Target numbering: 1-18 sequential
   Mapping: 1-9 unchanged, 10-13 unchanged, 14→10-new, 15-17 unchanged, 18→new
   WAIT — the current set IS 1-13, 14, 15, 16, 17, 18 = 18 invariants total.
   The gaps are only in the *display numbering* in Section 4 (shows 14 after 9, 18
   after 14). The invariants themselves are not missing — they just have non-sequential
   labels. The rename map is:
     Display 14 → sequential 10 (write_file prohibition)
     Display 18 → sequential 11 (DB write prohibition)
     Then 10-13 become 12-15, 15 becomes 16, 16 becomes 17, 17 becomes 18
   ACTUALLY: read the full current set before deciding. Do not trust this mapping
   without re-reading AGENTS.md Section 4 and 5 at session start.

4. src/ is likely locked again by next session. Run init_state.py + handshake.py src
   before attempting any writes.

---

## State at Session Close

### projecttracking.md — current active tasks
- v0.11.92 IN_PROGRESS (COLLAPSE-03, claude) — completed this session, needs COMPLETED move
- v0.11.91 IN_PROGRESS (C5, claude) — completed this session, needs COMPLETED move
- v0.11.86 IN_PROGRESS (BUG-086, gemini) — not touched this session
- v0.11.61 READY (BUG-061, gemini) — not touched
- v0.11.52 READY (BUG-052, codex) — not touched
- v0.11.36 IN_PROGRESS (canonicalization, codex) — not touched
- COLLAPSE-05 BACKLOG — scope needs expansion before scheduling

### New bugs logged this session
- BUG-131: OpenAI CLI round-trip unverified (P2, OPEN, Task v0.11.91)
- BUG-132: Ollama validation (P2, RESOLVED — external validation PASS)
- BUG-134: Model selection hardcoded all backends (P2, OPEN, no task yet)
- BUG-135: init-project.js writes stub not template (P2, OPEN, no task yet)

### Files modified this session
- `/Users/johnserious/MBO/bin/validator.py` — line 14 path fix
- `/Users/johnserious/MBO/.mbo/sessions/NEXT_SESSION.md` — bootstrapped + updated
- `/Users/johnserious/MBO/.dev/governance/projecttracking.md` — tasks added
- `/Users/johnserious/MBO/.dev/governance/BUGS.md` — BUG-131/132/134/135 appended
- `/Users/johnserious/MBO/src/templates/AGENTS.md` — rewritten to v1.1
- `/Users/johnserious/MBO/docs/agent-onboarding.md` — two path fixes
- `/Users/johnserious/MBO/scripts/mbo-session-close.sh` — COLLAPSE-02/04 (prior session)
- `/Users/johnserious/MBO/.dev/governance/STATE_FORMAT.md` — created (prior session)
- `/Users/johnserious/MBO/.dev/archive/governance-artifacts/TECHNICAL_DEBT.md` — moved here

---

## What The Next Agent Should Do

### Step 1 — Gate 0
```bash
cd /Users/johnserious/MBO && python3 bin/validator.py --all
```
Expected: clean pass. If NEXT_SESSION stale, touch `.mbo/sessions/NEXT_SESSION.md`.

### Step 2 — Close completed tasks
Move v0.11.91 and v0.11.92 from Active to Recently Completed in projecttracking.md.
Update Next Task pointer to v0.11.93 (or next unstarted task).

### Step 3 — Expand COLLAPSE-05 backlog entry
Update COLLAPSE-05 acceptance criteria in projecttracking.md to include full src/
cross-reference surface. Do not start implementation — backlog only.

### Step 4 — COLLAPSE-05 implementation (new session, new task)
Requires:
1. `python3 bin/init_state.py` (src/ lock likely reset by then)
2. `python3 bin/handshake.py src`
3. New task entry (v0.11.93 or next available) with full scope
4. Read AGENTS.md Sections 4+5 to derive correct sequential renumber map
5. DID prompt for the other agent
6. Implement across: .dev/governance/AGENTS.md, src/templates/AGENTS.md,
   src/auth/call-model.js, src/auth/operator.js, src/auth/did-orchestrator.js,
   src/state/event-store.js, src/state/state-manager.js, src/state/redactor.js,
   src/graph/graph-store.js, src/sandbox/sandbox-manager.js,
   scripts/test-invariants.js, scripts/verify-chain.js,
   scripts/test-redactor.js, scripts/test-redactor-v2.js,
   docs/agent-onboarding.md, docs/invariant-audit.md
7. Worktree copies update automatically on merge — do not edit them directly

### Step 5 — Carry-forward active tasks
After COLLAPSE-05: v0.11.86 (BUG-086), v0.11.36 (canonicalization), v0.11.61,
v0.11.52 are all still live.

---

## Known Issues / Watch Items

### v0.11.91 and v0.11.92 still show IN_PROGRESS
Both completed this session. Next agent should move them to Recently Completed and
update projecttracking.md accordingly before starting new work.

### src/ lock state
`write.deny` was cleared this session via `init_state.py` + `handshake.py src`.
It will be reset by the time the next session opens. Standard recovery:
```bash
python3 bin/init_state.py   # recompute state.json
python3 bin/handshake.py src  # unlock src/
```

### COLLAPSE-05 backlog acceptance criteria is stale
Current text only mentions docs/agent-onboarding.md and src/templates/AGENTS.md.
Must be expanded before anyone picks it up.

---

*Written: 2026-03-18 — end of governance collapse session C*
*Next session: Gate 0 → close v0.11.91/v0.11.92 → expand COLLAPSE-05 scope → new session for implementation*
