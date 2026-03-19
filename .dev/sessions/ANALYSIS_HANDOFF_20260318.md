# MBO Architecture Analysis Handoff
## Session: 2026-03-18 — READ ONLY SESSION, NO WRITES MADE

**Purpose:** Full governance audit and architectural pivot analysis.
**Next session picks up at:** Part 2 — Governance Collapse Draft

---

## THE PIVOT (understand this first)

MBO is moving from a **process-based trust model** to an **API-native payload-based trust model**.

Core insight: Agents are stateless text generators over the wire. They cannot touch the
filesystem. The only dangerous moment is the write step. Therefore the verification stack
collapses to one hard gate at the write step. Everything before it is text in, text out.

The governance document structure collapses from its current sprawl into THREE documents:
- `AGENTS.md` — roles and permissions
- `STATE.md` — current project state
- `SPEC.md` — implementation contract (gate spec lives here as a section, not standalone)

---

## PART 1 COMPLETE — BUG TRIAGE FINAL VERDICTS

### Bugs that are DONE IN CODE but still marked OPEN in BUGS.md
These need to be closed — no code work required, just governance updates:

| Bug | Status in Code | Action |
|---|---|---|
| BUG-086 | DONE — projectRoot guard implemented at lines 334-358 of onboarding.js | Mark RESOLVED |
| BUG-052 | DONE — bin/mbo.js exists, package.json has bin field | Mark RESOLVED |
| BUG-121 | DONE — LLM-driven arch supersedes string fix; no hardcoded Q3 wording | Mark RESOLVED |
| BUG-122 | DONE — auto-create offer at onboarding.js line 319 | Mark RESOLVED |
| BUG-123 | DONE — external staging opt-in gate at onboarding.js line 305 | Mark RESOLVED |
| BUG-124 | DONE — getScanRoots() exists, zero-file scan handled gracefully | Mark RESOLVED |
| BUG-126 | DONE — graph_rescan_changed in mcp_query.js AND mcp-server.js | Mark RESOLVED |

### Bugs that are genuinely OPEN

| Bug | Classification | Notes |
|---|---|---|
| BUG-061 | REQUIRED | Pile Merkle done; session-close uses raw curl (not mcp_query.js); Merkle scope contract doc missing |
| BUG-063 | BLOCKED | No userPresence ACL in handshake.py; blocked on redesign auth semantics |
| BUG-119 | REQUIRED | Section 36 transcript-level validation — architecture is correct, live run needed |
| BUG-128 | MOOT (low pri) | rebuild-mirror.js runs unconditionally outside RATIO condition — one-line fix |
| BUG-129 | REQUIRED | Full rescan still calls enrich() synchronously (line 532/608 mcp-server.js); changed-file path already fixed via .catch() fire-and-forget |
| BUG-130 | REQUIRED (after 129) | Measure static-only timing, set curl --max-time accordingly |
| BUG-120 | MOOT | Tokenmiser UI polish, doesn't gate self-build |
| BUG-125 | MOOT | Structurally impossible in API-native model |

---

## PART 1 COMPLETE — GOVERNANCE DRIFT FULL INVENTORY

### Problem 1: Two AGENTS.md files, both diverged

Root AGENTS.md (296 lines, 2026-03-17):
- Has Invariants 18-20 (MCP endpoint resolution, success semantics, graph backoff)
- Has Section 15 (Task Versioning Scheme)
- Invariant 17 = Branch-Isolated (branch only, no worktree)
- Section 11 health check = `node scripts/mcp_query.js --diagnose graph_server_info` ✓

.dev/governance/AGENTS.md (264 lines, 2026-03-17):
- Has Invariant 18 = DB Write Prohibition (BUG-125 fix) — conflicts with root's Inv 18
- Invariant 17 = Worktree-Isolated (full git worktree protocol) — more rigorous
- Section 11 health check = old curl command ✗
- Missing Section 15 (Task Versioning)
- Has "No File Modifications Without Explicit Approval" block in Section 10

**DECISION MADE:** The new architecture is:
- `.dev/governance/AGENTS.md` = THE SOURCE (hand-authored, dev protocol, never ships)
- Root `AGENTS.md` in client projects = GENERATED ARTIFACT from onboarding profile
  (project-scoped: roles, permissions, prime directive, danger zones, verification commands)
  (NOT a copy of .dev/governance/AGENTS.md — different document, different job)
- SPEC Section 8 already specifies this — "operator drafts AGENTS.md as part of onboarding"
  — it was just never implemented correctly

### Problem 2: Two CHANGELOG.md files
- Root: 678 lines, full history — CANONICAL
- .dev/governance: 14 lines stub — NOISE, to be removed

### Problem 3: Three NEXT_SESSION.md copies
Root, .dev/sessions/, data/ — all identical by MD5 currently.
session-close.sh writes all three simultaneously ("backward compatibility").
DECISION MADE: `.mbo/sessions/NEXT_SESSION.md` is the one canonical location.
Session-close writes there only. Root and data/ copies are strays.

### Problem 4: projecttracking.md vs reality
Tasks marked active that are already done:
- v0.11.86 (BUG-086) — IN_PROGRESS but code is done; needs re-validation test
- v0.11.52 (BUG-052) — READY but already implemented
- v0.11.61 (BUG-061) — READY, partial (Pile done, curl path and scope contract not done)

Tasks in ROADMAP.md not in projecttracking.md:
- 1.1-H13 (directory structure cleanup)
- 1.1-H26 (Persona Store & Entropy Gate)
- 1.1-H27 (Agent Output Streaming / Section 33)
- 1.1-H29 (Context Minimization / Section 35 — only assumption ledger exists)
- Milestone 1.2 items (Panel Gating, Economic Governor)

### Problem 5: SPEC.md internal contradictions
- Section 6 line 494: still says `StdioServerTransport` — superseded by H23/H30
- Section 6: transport line never updated to StreamableHTTP
- Appendix D traceability matrix references legacy task IDs not in projecttracking

### Problem 6: DESIGN_DECISIONS.md — three approved decisions with no task entries
- DDR-001 (Conversational Agent Output Layer) — no SPEC section, no task
- DDR-002 (Persona System) — AGENTS Section 13 exists but no SPEC section
- DDR-003 (Dev Workflow Alignment) — no task entry
All marked "pending SPEC section and task creation" — never actioned.

### Problem 7: docs/ — stale or wrong
- docs/mcp.md: Claims .mbo/run/mcp.json "no longer exists" — false, it's still a fallback
- docs/operator-guide.md: References `node src/mcp/mcp-server.js` — wrong path
  (actual: `src/graph/mcp-server.js`). Also references `journal_reader.py` — not in repo.
- docs/agent-onboarding.md: References `graph_update_task` as MCP tool — not exposed

### Problem 8: .dev/preflight/ — mixed current and stale
- mcp-daemon-migration.md — marked SUPERSEDED, still present, confuses agents
- did-output-claude.md (67KB) — raw DID dump, not a governance doc, should be archived
- did-output-gemini.md — same
- assumption-ledger-h29.md — task-specific artifact, shouldn't live in governance forever

### Problem 9: Terminology fragmentation
Same concept has 3-4 names across docs:
- Stage 1.5 / Entropy Gate / Assumption Ledger / Section 27 Assumption Ledger
- `node mcp_query.js --diagnose` / `curl http://...PORT/health` / `mbo mcp`
- "human types go" / "human approval" / "respond approved"

### Problem 10: .mbo/ footprint in client projects (NEW — identified end of session)
When MBO deploys to a new project, files that should NOT be in the project root are:
- AGENTS.md (full dev governance doc — wrong context for client project)
- NEXT_SESSION.md (should be .mbo/sessions/)
- CHANGELOG.md (MBO's own changelog)
- ROADMAP.md (MBO's product roadmap)
- letsgo.md (MBO dev session primer — internal)
- docs/ directory (all MBO internals)
- personalities/ (this one is actually correct — agents need it)

Current .mbo/ has stub files (.mbo/AGENTS.md = 1 line, .mbo/BUGS.md = 1 line,
.mbo/CHANGELOG.md = 1 line) that were never properly populated.

.gitignore currently excludes .mbo/ but carves back: !.mbo/AGENTS.md, !.mbo/BUGS.md,
!.mbo/CHANGELOG.md — these stubs should be removed, real generated files committed.

**RULE ESTABLISHED:** All MBO files in client projects live in .mbo/. Nothing MBO-authored
at project root. The project root belongs to the project owner.

---

## OPEN CONFLICTS — NEED DECISIONS BEFORE PART 2

These are the questions that block the governance collapse draft.
Human Operator must answer each before next session writes anything.

**CONFLICT 1 — Invariant 17: Worktree vs Branch**
.dev AGENTS = worktree-isolated (full `git worktree add` protocol)
Root AGENTS = branch-isolated (branch only)
Which is current practice? (.dev version is more recent and more rigorous)

**CONFLICT 2 — Invariant 18 number collision**
Root uses Inv 18-20 for MCP endpoint resolution/semantics/backoff.
.dev uses Inv 18 for DB Write Prohibition (BUG-125 fix).
Both need to exist. Which gets number 18?
(DB prohibition is more recently added and more safety-critical)

**CONFLICT 3 — MCP health check command**
Root AGENTS Section 11: `node scripts/mcp_query.js --diagnose graph_server_info`
.dev AGENTS Section 11: old curl command
Confirming mcp_query.js version is canonical?

**CONFLICT 4 — DDR-001/002/003 disposition**
Three approved design decisions never filed as tasks or SPEC sections.
Options: (a) into SPEC.md as new sections, (b) into STATE.md as future work,
(c) task entries in projecttracking. Which?

**CONFLICT 5 — TECHNICAL_DEBT.md**
Last updated 2026-03-08, two old items (OpenAI CLI, Ollama).
Options: (a) archive it, (b) fold into BUGS.md, (c) keep as .mbo/ doc.

**CONFLICT 6 — NEXT_SESSION.md canonical path**
Decision made: `.mbo/sessions/NEXT_SESSION.md` only.
Confirming this replaces all three current locations?

---

## PART 2 SCOPE — Governance Collapse Draft

When conflicts are resolved, Part 2 drafts collapse into THREE documents.
This is analysis only — no writes until human approves.

### New AGENTS.md (.dev/governance/ — the source)
Merge from both current versions. Resolve all conflicts per decisions above.
Add: DB Write Prohibition as definitive Invariant (number TBD)
Add: Section 15 Task Versioning (from root only)
Update: Invariant 17 to worktree-isolated (if confirmed)
Update: Section 11 health check to mcp_query.js version (if confirmed)
Update: .mbo/ footprint rule — document that client AGENTS.md is generated
Remove: MCP endpoint resolution invariants that are superseded by API-native model

### New STATE.md (replaces projecttracking.md + NEXT_SESSION.md)
Single document for current project state.
Contains: active milestone, current task, open bugs, next action, session handoff.
Generated by session-close, not hand-edited.

### Updated SPEC.md
Add: API-native pipeline redesign section
Add: Three-zone model
Add: Gate-at-write-step as the trust boundary
Add: .mbo/ footprint contract (all client files in .mbo/)
Add: Generated AGENTS.md contract (what it contains, how it's produced)
Fix: Section 6 StdioServerTransport → StreamableHTTP
Fix: Appendix D traceability matrix legacy IDs
Archive: Superseded sections (already done for Section 32)

---

## PART 3 SCOPE — Spec Integration (after Part 2 approved)

Integrate API-native pipeline redesign into SPEC.md.
Gate spec as a section in SPEC.md (not standalone doc).
Flag anything contradicting existing sections.

---

## FILE LOCATIONS FOR REFERENCE

All governance source files read this session:
- /Users/johnserious/mbo/.dev/governance/AGENTS.md
- /Users/johnserious/mbo/.dev/governance/BUGS.md
- /Users/johnserious/mbo/.dev/governance/projecttracking.md
- /Users/johnserious/mbo/.dev/governance/DESIGN_DECISIONS.md
- /Users/johnserious/mbo/.dev/governance/TECHNICAL_DEBT.md
- /Users/johnserious/mbo/.dev/governance/assumption-ledger-h29.md
- /Users/johnserious/mbo/.dev/spec/SPEC.md
- /Users/johnserious/mbo/AGENTS.md
- /Users/johnserious/mbo/NEXT_SESSION.md
- /Users/johnserious/mbo/ROADMAP.md
- /Users/johnserious/mbo/letsgo.md
- /Users/johnserious/mbo/docs/operator-guide.md
- /Users/johnserious/mbo/docs/mcp.md
- /Users/johnserious/mbo/docs/agent-onboarding.md
- /Users/johnserious/mbo/.dev/preflight/onboarding-conversational-model.md
- /Users/johnserious/mbo/.dev/preflight/mcp-daemon-migration.md
- /Users/johnserious/mbo/scripts/mbo-session-close.sh
- /Users/johnserious/mbo/scripts/mcp_query.js
- /Users/johnserious/mbo/src/cli/onboarding.js
- /Users/johnserious/mbo/src/graph/mcp-server.js
- /Users/johnserious/mbo/personalities/onboarding.md
- /Users/johnserious/mbo/bin/mbo.js
- /Users/johnserious/mbo/.gitignore

Code audit confirmed (no writes needed, just BUGS.md updates):
- BUG-086: onboarding.js lines 334-358
- BUG-052: bin/mbo.js exists, package.json bin field present
- BUG-122: onboarding.js line 319
- BUG-123: onboarding.js line 305
- BUG-124: getScanRoots() function present
- BUG-126: mcp_query.js lines ~430, mcp-server.js lines 281/368
- BUG-128: session-close.sh lines 258-275 (rebuild unconditional — still open)
- BUG-129: mcp-server.js lines 356/397/452 (.catch pattern) + lines 532/608 (still sync)

---

---

## .DEV DIRECTORY STRUCTURE (canonical — established this session)

```
.dev/governance/    LIVE GOVERNANCE ONLY
                    AGENTS.md, BUGS.md, CHANGELOG.md, projecttracking.md,
                    DESIGN_DECISIONS.md, DID-PROTOCOL.pdf, TECHNICAL_DEBT.md,
                    complexity.toml, imports.allow, nhash, overrides/
                    NOTHING ELSE. No handoffs, no dumps, no task artifacts.

.dev/spec/          SPEC.md ONLY
                    One file. The implementation contract.

.dev/preflight/     ACTIVE DECISION PROMPTS
                    DID prompts, architecture decision docs, onboarding model docs.
                    Only documents that are currently actionable inputs to a task.
                    Superseded preflight docs → archive immediately.

.dev/sessions/      GENERATED SESSION ARTIFACTS
                    NEXT_SESSION.md (canonical location — only copy)
                    Session handoffs, analysis outputs, milestone plans.
                    Hand-edited session artifacts go here, not in governance.

.dev/archive/       COMPLETED / SUPERSEDED MATERIAL
                    did-outputs/          raw DID output dumps
                    spec-history/         old SPEC versions, corrupt files
                    preflight-superseded/ superseded decision docs
                    governance-artifacts/ completed task-specific ledgers
```

*Written: 2026-03-18 — analysis session, no source code writes*
*Housekeeping writes: moved 12 misplaced files to correct locations*
*Next session: answer 6 conflicts above, then proceed to Part 2 draft*


---

## CONFLICT RESOLUTIONS — FINAL (operator decisions + synthesis)

**C1 — Invariant 17: Worktree-Isolated is canonical.**
Full `git worktree add .dev/worktree/<agent>-<task> -b <agent>/<task>` protocol.
Each agent session gets its own worktree. Sharing working directories between
concurrent agents is prohibited. Root AGENTS.md "branch-isolated" language
is superseded and must be removed in the collapse.

**C2 — Invariant 18: DB Write Prohibition.**
Inv 18 = DB Write Prohibition (BUG-125 fix, from .dev/governance/AGENTS.md).
MCP endpoint resolution, success semantics, and graph query backoff invariants
(formerly Inv 18-20 in root AGENTS.md) are REMOVED in the collapse.
They were compensating for process-management complexity that no longer exists
under the API-native model. Any residual MCP behavioral guidance belongs in
docs/ not in governance invariants.

**C3 — MCP health check: mcp_query.js is canonical.**
`node scripts/mcp_query.js --diagnose graph_server_info`
Use this everywhere in Section 11. All curl-only language removed.

**C4 — DDR-001/002/003: Task entries AND SPEC promotion.**
Each DDR gets a task entry in projecttracking.md AND its normative content
promoted into SPEC.md as a proper numbered section. STATE.md tracks status
only — it does not own design decisions. SPEC.md is the contract.

**C5 — TECHNICAL_DEBT.md: Archive after migration.**
Two actionable items (OpenAI CLI round-trip, Ollama round-trip) are migrated
to BUGS.md as open verification tasks. TECHNICAL_DEBT.md then moves to
.dev/archive/. Keeps the collapse to three governing docs, no parallel tracking.

**C6 — NEXT_SESSION.md canonical path: .mbo/sessions/NEXT_SESSION.md only.**
All three current locations (root, .dev/sessions/, data/) collapse to one.
session-close.sh writes .mbo/sessions/NEXT_SESSION.md only.
AGENTS.md Section 1 updated to read from .mbo/sessions/NEXT_SESSION.md.
Short compatibility window: symlink old paths during transition, then remove.

---

## PART 2 SCOPE — Governance Collapse

Three target documents. Draft order: AGENTS.md → STATE.md → SPEC.md updates.

### A — .dev/governance/AGENTS.md (hand-authored source)

KEEP from .dev/governance/ version:
- Invariant 17 Worktree-Isolated (full git worktree protocol)
- Invariant 18 DB Write Prohibition (exact text)
- "No File Modifications Without Explicit Approval" block in Section 10
- Step 3 in Section 12 as "Create Working Worktree" with full command

KEEP from root version:
- Section 15 Task Versioning Scheme (unique to root, must survive)
- Sections 13/14 Persona Store and Entropy Gate (use root text)

ADD:
- Client-project rule: all MBO-authored files in client projects live under
  .mbo/. Nothing MBO-authored at project root. Root belongs to project owner.
- Generated AGENTS.md rule: .mbo/AGENTS.md is a generated artifact from
  onboarding profile. NOT a copy of this document. This document governs
  MBO development only.
- NEXT_SESSION.md canonical path: .mbo/sessions/NEXT_SESSION.md

REMOVE:
- Old curl health check command (Section 11)
- Invariants 18/19/20 MCP endpoint/semantics/backoff (superseded)
- Any reference to fixed port 7337
- "branch-isolated" language from Invariant 17

### B — .mbo/STATE.md (generated, replaces NEXT_SESSION.md as read surface)

Generated by session-close. Read by agents at Gate 0 alongside projecttracking.md.
projecttracking.md remains the human-editable task ledger. STATE.md is the
generated agent-facing read surface. They are complementary, not redundant.

Format:
  Header: milestone, current task, branch/worktree, last updated
  Active queue: task ID, title, status, owner, blockers
  Open P0/P1 bugs: bug ID, title, linked task
  Next action: one paragraph, what to do, what to validate
  Required Gate 0 commands (graph rescan + search)
  Session integrity: backup path, SHA-256, PRAGMA result, timestamp

No prose policy. No invariants. State only.

### C — .dev/spec/SPEC.md (targeted additions + flagged fixes)

FLAGGED CONTRADICTIONS (surface, don't silently resolve):
1. Section 6 line 494: StdioServerTransport → must change to StreamableHTTP
2. docs/mcp.md claims .mbo/run/mcp.json no longer exists — false, still a fallback
3. Appendix D: legacy task IDs not in projecttracking — rebuild against current IDs

ADD:
- Section 37: API-Native Trust Model
    Agents are stateless text generators. Cannot touch the filesystem.
    Only privileged boundary is the write step.
    Three zones: Zone 1 text corridor, Zone 2 validation, Zone 3 write gate.
    Human go required at write gate. Logged. Reversible.

- Section 38: .mbo/ Footprint Contract
    All MBO-authored files in client projects under .mbo/.
    Generated: .mbo/AGENTS.md, .mbo/STATE.md, .mbo/sessions/NEXT_SESSION.md
    Runtime: .mbo/mirrorbox.db, .mbo/config.json, .mbo/onboarding.json
    Personas: .mbo/personalities/
    Logs/run: .mbo/logs/, .mbo/run/, .mbo/sessions/

- Section 39: Generated Governance Contract
    .mbo/AGENTS.md produced by mbo setup from onboarding profile.
    Contents: project name, prime directive, authorized agents, danger zones,
    verification commands, write scope policy, pointer to MBO dev docs.
    Not a copy of .dev/governance/AGENTS.md. Regenerated on re-onboard.
    Versioned in mirrorbox.db.

- Sections 40/41/42: DDR-001/002/003 promoted as normative sections
    40: Conversational Agent Output Layer (DDR-001)
    41: Persona System (DDR-002)
    42: Dev Workflow / Pipeline Alignment (DDR-003)
    Each section tied to a task entry in projecttracking.md.

### D — projecttracking.md updates

Close (code confirms done):
- v0.11.86 (BUG-086): COMPLETED — onboarding.js lines 334-358
- v0.11.52 (BUG-052): COMPLETED — bin/mbo.js + package.json bin field

Close in BUGS.md (no task entries needed):
- BUG-121, 122, 123, 124, 126: RESOLVED — LLM-driven arch or code confirmed

Add tasks missing from projecttracking but present in ROADMAP/DDRs:
- 1.1-H13: Directory structure cleanup
- 1.1-H26: Persona Store & Entropy Gate
- 1.1-H27: Agent Output Streaming (Section 33)
- 1.1-H29: Context Minimization (Section 35)
- DDR-001 task: Conversational agent output (Section 40)
- DDR-002 task: Persona system SPEC section (Section 41)
- DDR-003 task: Dev workflow alignment (Section 42)
- TECH_DEBT-01: OpenAI CLI round-trip verification
- TECH_DEBT-02: Ollama round-trip verification

Add new tasks from this session:
- COLLAPSE-01: AGENTS.md collapse + generated client AGENTS.md
- COLLAPSE-02: STATE.md creation + session-close.sh update
- COLLAPSE-03: .mbo/ footprint migration
- COLLAPSE-04: NEXT_SESSION.md path consolidation

### E — Migration Sequencing

Steps classified REQUIRED (must land before MBO can self-build) or DEFERRED (safe to
do after self-build is running).

| Step | Task | Classification | Reason |
|---|---|---|---|
| 1 | Governance text changes: AGENTS.md collapse, STATE.md format, SPEC additions | REQUIRED | Agents read AGENTS.md at Gate 0 every session. Stale conflicting content causes drift on every run. |
| 2 | session-close.sh: write .mbo/sessions/NEXT_SESSION.md + STATE.md; symlink old paths | REQUIRED | Gate 0 reads NEXT_SESSION.md every session. Wrong path = broken orientation. STATE.md is the new agent read surface. |
| 3 | onboarding/setup: generate .mbo/AGENTS.md from onboarding profile | DEFERRED | Improves new-project experience but doesn't affect MBO developing itself. .dev/governance/AGENTS.md is what matters for self-build. |
| 4 | Archive TECHNICAL_DEBT.md after migrating two items to BUGS.md | DEFERRED | Housekeeping. No runtime impact. |
| 5 | Update .gitignore: remove !.mbo/AGENTS.md etc carve-outs | DEFERRED | Follows step 3. No runtime impact until generated AGENTS.md is implemented. |
| 6 | Validator: fail on duplicate state locations or stale legacy files | DEFERRED | Quality gate. Important but doesn't block self-build. Add after collapse is stable. |

**Task classifications:**
- COLLAPSE-01 (AGENTS.md collapse) → REQUIRED (step 1)
- COLLAPSE-02 (STATE.md + session-close.sh) → REQUIRED (step 2)
- COLLAPSE-03 (.mbo/ footprint migration, generated client AGENTS.md) → DEFERRED (step 3)
- COLLAPSE-04 (NEXT_SESSION.md path consolidation) → REQUIRED — same unit of work
  as COLLAPSE-02. session-close.sh is the writer for both. They ship together.

Required execution order:
1. Draft + approve AGENTS.md collapsed source (COLLAPSE-01)
2. Draft + approve STATE.md format; update session-close.sh to write both
   .mbo/sessions/NEXT_SESSION.md and .mbo/STATE.md (COLLAPSE-02 + COLLAPSE-04)
3. Update AGENTS.md Section 1 read paths to match new locations
4. Validate Gate 0 works end-to-end with new paths before closing

---

*Conflicts resolved. All decisions recorded. Migration sequencing classified.*
*Ready for Part 2 draft in next session.*
