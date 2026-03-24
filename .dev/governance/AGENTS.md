# AGENTS.md
## Mirror Box Orchestrator — Autonomous Agent Governance (v1.0)

**Scope:** This document governs the behavior of MBO's autonomous pipeline. It is consulted at every task execution. Read at the start of every session.

---

## Section 1 — Session Start Protocol

Every development session begins in this order. No exceptions.

1. Read this file (`AGENTS.md`)
2. Read `.dev/governance/projecttracking.md` — identify current milestone and active task (single source of truth)
3. Read `.dev/governance/BUGS.md` — check linked P0/P1 blockers for the active task

No code is written before this sequence completes.

---

## Section 2 — Development Protocol (DID) & Routing Tiers

**Every task must exist in `projecttracking.md` before code is written.**

The agents are interchangeable peers. Before executing a task, the human Operator determines the Routing Tier:

**Tier 0 & 1 (Low Risk / Single File / Docs):**
- A single agent proposes the implementation and writes the diff. 
- If the human approves, that agent implements it directly.

**Tier 2 & 3 (High Risk / Multi-File / Architecture / Governance):** (Dual Independent Derivation)
1. Any modification to `SPEC.md`, `AGENTS.md`, or the governance directory.
2. **Agent A (Gemini)** proposes the implementation and writes the diff.
3. **Agent B (Claude)** MUST independently derive their own implementation BLIND — no Agent A output visible.
4. The human Operator reconciles the two versions.
5. Only after reconciliation and human "go" is the implementation committed.
6. If unresolvable: Claude gets one retry on the conflict zone only. If still unresolved: **Codex** is the tiebreaker.

Full protocol: `.dev/governance/DID-PROTOCOL.pdf`
Implementation task: `1.1-H24` — see `.dev/preflight/did-protocol-implementation.md`

---

## Section 3 — Authorship & Attribution Policy

1. **Authorship is for the Architect:** No agent shall claim authorship credit on commit pushes, pull requests, or documentation.
2. **No "AI-Generated" Branding:** Agents must not prepend "AI-Generated" or similar self-crediting labels to commit messages unless explicitly configured by the architect for audit purposes.

---

## Section 4 — What Agents Can and Cannot Do (Security Invariants)

| Agent | Can | Cannot |
|-------|-----|--------|
| Gemini CLI | Peer developer. Propose, review, derive, and implement. | Write to src/ without task in projecttracking.md |
| Claude Code | Peer developer. Propose, review, derive, and implement. | See the other agent's reasoning before producing its own |

### Core Security Invariants (v1.0)
1. **Invariant 1:** No unapproved file modifications.
2. **Invariant 2:** No write access outside project root.
3. **Invariant 3:** No execution without human approval.
4. **Invariant 4:** Every operation reproducible from the event store.
5. **Invariant 5:** Failed builds revert automatically.
6. **Invariant 6:** No model bypasses `callModel`.
7. **Invariant 7:** Context isolation enforced at runtime.
8. **Invariant 8:** Secrets never enter sandbox execution.
9. **Invariant 9:** Local models stay local.
18. **Invariant 18 (DB Write Prohibition):** Agents MUST NOT write directly to any database (mirrorbox.db, dev-graph.db, or any SQLite file) under any circumstances. The `tasks` table and all pipeline state in the DB is seeded exclusively by the Operator running the pipeline from `projecttracking.md`. Agents interact with state only through governance files (`projecttracking.md`, `BUGS.md`). Direct `INSERT`, `UPDATE`, or `DELETE` against the DB — via node eval, sqlite3 CLI, or any MCP tool call that proxies raw SQL — is a governance violation equivalent to bypassing the handshake protocol.
14. **Invariant 14:** No `write_file` for overwrites. Overwriting or modifying an existing file via `write_file` is prohibited. `replace` MUST be used for all modifications to existing files to ensure surgical precision. `write_file` is reserved for creating new files only.

---

## Section 5 — Session Management & Two-World Integrity

### Invariant 10 (Two-World Isolation)
- Every operation shall explicitly declare its target scope: `world_id = mirror | subject`.
- Reads may span worlds; writes must target exactly one world.
- Missing or invalid `world_id` is a hard failure.

### Invariant 11 (Graph Investigation)
- Retrieval must use `graph_search` and `graph_query_impact`.
- Full SPEC/file-dump context injection is disallowed by default.

### Invariant 12 (HardState Budget)
- Enforce 5,000-token HardState ceiling.
- Allocation: 600 invariants, 1,800 evidence, 1,200 prior decisions, 900 reasoning, 500 reserve.

### Invariant 13 (Pre-Mutation Checkpoints & Backups)
- Immutable checkpoint required before any mutation in either world.
- **Atomic Topology Backup:** Before any file modification or creation, a backup of the original document MUST be written to `.dev/bak/` preserving the same directory topology as the repository.

### Invariant 15 (Non-Destructive Recovery)
- Prohibit `rm -f` and delete/recreate schema recovery patterns.

### Invariant 16 (Atomic Session-End Backup)
- On session close, atomically persist event flush, graph delta, governance state, and integrity hashes.
- Run `PRAGMA integrity_check`.

### Invariant 17 (Worktree-Isolated Verification Gate)
- All implementation work MUST occur in a dedicated git worktree with its own branch (`<agent>/<task-or-scope>`, e.g. `claude/`, `gemini/`, `codex/`).
- Worktree path convention: `.dev/worktree/<agent>-<task>/` (e.g. `.dev/worktree/claude-task-1/`).
- Create with: `git worktree add .dev/worktree/<agent>-<task> -b <agent>/<task>`.
- Each agent session MUST use its own worktree. Sharing a working directory between concurrent agents is prohibited — branch checkouts in a shared directory affect all agents simultaneously.
- No apply/merge/promotion to the target branch until verification gate passes.
- Verification gate minimum: `python3 bin/validator.py --all` passes, task-specific tests pass, and no new P0/P1 regressions are introduced.
- If verification fails, fix-forward on the same working branch; do not apply partial changes.
- On session close, remove the worktree: `git worktree remove .dev/worktree/<agent>-<task>` (after branch finalization).

---

## Section 6 — Proactive State Sync & Session Protocols

### 6A. The Audit Gate (Completion Trigger)
The moment a task is implemented and Stage 8 passes, halt and present the audit package:
1. Unified diff of all changes.
2. Full output of `python3 bin/validator.py --all`.
3. One-paragraph summary.

### 6B. State Sync (Automatic on Approval)
On `approved`: update `projecttracking.md`, `BUGS.md` (active only), and `BUGS-resolved.md` as needed, then commit the changes. Update the root `CHANGELOG.md` only when the approved work changes the public version in `package.json` or otherwise warrants a public-facing release note.

### 6B.1. Pre-Push Governance Sync (Required)
Before any push, promotion, or session wrap, reconcile all governance documents to the current state of the work. At minimum verify and update:
1. `projecttracking.md` — active/completed task status, ownership, links, next task.
2. `BUGS.md` — only active bugs remain open; every open bug has the correct version-scoped task link.
3. `BUGS-resolved.md` — every fixed/completed/superseded bug is archived exactly once.
4. Root `CHANGELOG.md` — updated only when `package.json` version changes or a public-facing release note is intentionally being published.
5. No handoff or "next session" document is created. Session continuity must be reflected directly in `projecttracking.md`, `BUGS.md`, and `BUGS-resolved.md`.

No branch is pushed and no session is considered wrapped until this reconciliation is complete.

### 6C. Session End
If "end session" is requested: terminate MCP, run Branch Finalization, and output checklist.

### 6D. Branch Finalization (Required Before Session Close)
1. If verification gate passed and changes are approved, promote branch changes to `main` (or configured target branch) via approved merge strategy.
2. Record promotion outcome in canonical governance artifacts and run artifacts only.
3. Remove the working branch after successful promotion (local + remote) unless explicitly marked for retention.
4. Retained branches MUST be renamed or created under `archive/` with a short reason recorded in `projecttracking.md` or a run artifact.

---

## Section 7 — Critical Constraints

1. `callModel` is the only path to any model.
2. No file write outside approved scope.
3. No code touches a real repository without human `go`.
4. Every model call logged to event store before and after.
5. Reviewer never sees planner output before Stage 4C.

---

## Section 8 — Required Affirmation

Before this session proceeds, you must physically read the governance files and report the base nhash:
`(AGENTS sections + BUGS sections) × 3 = [Base Result]`

Wait for human salt. Calculate `nhash * salt = Hard State Anchor`. 

**Non-Persistence Mandate:** You MUST NOT document, persist, or commit the nhash calculation, the salt, or the resulting Anchor in any file. This value exists only within the `[Hard State: X]` tag in your internal thinking blocks for the duration of the current session.

Report the Hard State Anchor and state: "I will not make assumptions about the intentions of the human at any time."

Identify the next scheduled task from `projecttracking.md` and ask: "Would you like to work on this or something else?"

---

## Section 9 — Strict Mode (Code Output Constraints)

1. **Unified Diffs Only:** All modifications must be proposed as a unified diff.
2. **No stylistic or cleanup changes** unless they fix a functional bug or improve performance >10%.
3. **Handshake Protocol:** 
   - `src/**`: Locked (444). Ask human for `mbo auth src`, wait for `go`, use `impl_step.sh`.
   - `.dev/governance/**`, `scripts/**`, `bin/**`: Unlocked. Use `impl_step.sh`.

---

## Section 10 — Hard State Persistence

Explicitly state your **Hard State Anchor** at the beginning of every internal `<thinking>` block: `<thinking>[Hard State: X] ...`

**No File Modifications Without Explicit Approval:** Agents must NOT edit, create, or modify any file without explicit human authorization ("go"). All file interactions must use MCP tools. Hard state is tracked in agent sessions — if using an MCP server, state must be saved and the server restarted before proceeding.

---

## Section 11 — Graph-Assisted Context

Run only the queries listed in the active task record, explicit human runbook, or other current canonical instructions.

**MCP connection (as of 2026-03-13):**
The graph server is a launchd system daemon at project-scoped dynamic endpoint.
No fixed port, manifest-based discovery required, no port negotiation, no session ID management.

If the dev graph server is unavailable:
- Check: `curl http://127.0.0.1:$(node -e 'console.log(require("./.dev/run/mcp.json").port)')/health`
- Start: `mbo mcp`
- State: "Dev graph unavailable. Ran `curl /health` — [result]. Awaiting human instruction."

MCP is available via dynamic manifest-resolved endpoint. Run `curl http://127.0.0.1:$(node -e 'console.log(require("./.dev/run/mcp.json").port)')/health` to verify before starting.

---

## Section 12 — MBO Operational Workflow (Sovereign Loop)

Every development session MUST follow this checklist:
1. **Identify Task** from `projecttracking.md`.
2. **Permission Check** via `python3 bin/handshake.py <cell_name>`.
3. **Create Working Worktree** — `git worktree add .dev/worktree/<agent>-<task> -b <agent>/<task>` — and work exclusively inside it. Never share a working directory with a concurrent agent session.
   > **DB Write Prohibition:** At no point in this loop may an agent write directly to mirrorbox.db or any pipeline database. All task state flows through governance files → Operator → pipeline. (See Invariant 18.)
4. **Derive & Propose** solution from graph context.
5. **Human Approval** ("go").
6. **Implement on Branch & Verify** (`python3 bin/validator.py --all` + task-specific tests).
7. **Verification Gate Decision** — apply/promotion is allowed only after required checks pass.
8. **Audit Gate** (diff + validator output + summary).
9. **Sync State** (`projecttracking.md`, `BUGS.md`, `BUGS-resolved.md`, and root `CHANGELOG.md` only when the public version changes).
10. **Branch Finalization** (promote approved, verified branch to target, then delete or archive branch).
11. **Lock & Journal** (`handshake.py --revoke` and `init_state.py`).

---

## Section 16 — Workflow Canonicalization (Single Source of Truth)

To eliminate state drift across governance files, workflow ownership is strict:

1. `projecttracking.md` is the only canonical task ledger.
2. Every active task row MUST include: `Task ID`, `Type`, `Title`, `Status`, `Owner`, `Branch`, `Updated`, `Links`, `Last Backup SHA/File`, and `Acceptance`.
3. `BUGS.md` is an active bug registry only. Every OPEN/PARTIAL bug MUST include a `Task:` link to a task ID in `projecttracking.md`.
4. `BUGS-resolved.md` is an archive-only registry for resolved/completed/superseded bugs. New bug entries MUST NOT be logged there.
5. Root `CHANGELOG.md` is a public-facing release log only. It is updated on version changes and is not canonical governance state.
6. Handoff files such as `NEXT_SESSION.md`, `SESSION-HANDOFF`, or ad hoc session ledgers are prohibited. The ledger update is the handoff.
7. `python3 bin/validator.py --all` MUST fail when:
   - any OPEN/PARTIAL P0/P1 bug lacks a linked task ID,
   - linked task ID does not exist in `projecttracking.md`.

**Authoring rule:** update state only at task status transitions and at session close.

---

## Section 13 — Persona Store & Reasoning Constraints

### 13A. Persona Resolution
Agents derive their reasoning style from Persona Markdown files. The system resolves these in order:
1. `~/.orchestrator/personas/<id>.md` (User library)
2. `<project>/.mbo/personalities/<id>.md` (Project overrides)
3. `<MBO_ROOT>/personalities/<alias>.md` (System defaults)

### 13B. Reasoning Constraints
Personas are not cosmetic. Each persona defines a **Reasoning Constraint** based on the role's primary failure mode:
- **Classifier (The Sentry):** Structurally biased toward escalation; "When in doubt, escalate."
- **Planner (The Minimalist):** Every line must earn its place; anti-over-engineering.
- **Reviewer (The Skeptic):** Adversarial independence; derive first, then compare.
- **Tiebreaker (The Arbitrator):** Select, don't synthesize; rule on load-bearing diffs.
- **Operator (The Anchor):** Clarity under complexity; human-readable status only.

### 13C. Project Assignments (`.mbo/persona.json`)
Projects define their active personas in `.mbo/persona.json`. Changes to this file travel with the repository.

---

## Section 14 — Entropy Gate & Decomposition

### 14A. Entropy Score Calculation
Every task in Stage 1.5 generates an **Entropy Score** via the Assumption Ledger:
- **Critical Assumption:** 3.0 points
- **High Impact Assumption:** 1.5 points
- **Low Impact Assumption:** 0.5 points

### 14B. The Hard Stop
- **Entropy > 10:** The task is **BLOCKED**. The pipeline halts before any planning begins.
- **Remedy:** The human Architect must decompose the task into smaller, independent subtasks until the entropy of each subtask is ≤ 10.

---

---

## Section 17 — Version Bump Protocol

Every version change — whether proposed by an agent or requested by the human — follows this sequence without exception.

### 17A. Version Number Scheme
MBO task/version lanes follow the canonical task numbering scheme defined in [`VERSIONING.md`](./VERSIONING.md).

Canonical task ID shape:
- `v0.LL.NN`
- `LL` = two-digit lane/module identifier
- `NN` = zero-padded task sequence within that lane

Rules:
- `v1.x` task lanes are invalid in this repo. Internal governance/task work remains under `v0.*` lanes.
- The sequence after the second decimal resets per lane. Example: `v0.13.01`, `v0.13.02`, then separately `v0.14.01`.
- A task or bug is assigned to the lane that matches the subsystem/module it modifies. It does not automatically inherit the highest currently visible release series.

### 17A.1. Version Lane Assignment Rule
Use the lane definitions in [`VERSIONING.md`](./VERSIONING.md). In summary:

- `0.11.x` — milestone-1.1 hardening, cleanup, backports, bug fixes, runtime reliability corrections, onboarding/root/bootstrap fixes, and other stabilization work against functionality already introduced in earlier modules.
- `0.12.x` — graph/runtime intelligence refinement and related backend capability work.
- `0.13.x` — proprietary boundary, governance-scope, setup/config policy, and related boundary-definition work.
- `0.14.x` — operator logic, DID chooser/routing, tiebreakers, blast-radius policy, human-in-the-loop gates, and other execution-flow logic.
- `0.15.x` — cleanup/hardening module tasks explicitly defined in the V4 cleanup gate.
- `0.16.x` — CYNIC tax / per-session maintenance workflow design.
- `0.2.x` — scripting, workflow audit, automation, artifact generation, and auto-run tooling.
- `0.3.x` — TUI, operator-facing terminal UX, panel behavior, overlays, visual state, and other Ink/UI work.
- `0.4.x` / `0.41.x+` — V4 gate/release and post-gate module work as explicitly defined.

### 17A.2. Bug Identity Rule
Bug serial numbers are global, monotonic, and immutable. Historical bugs must not be renumbered.

- `BUG-001` through `BUG-184` are legacy-format bug records and remain valid as written.
- Starting with `BUG-185`, new bug entries use dual identification: immutable serial plus version-scoped task/lane, written as `BUG-### / v0.LL.NN`.
- The serial remains the canonical bug number. The version tag records the target work lane.
- New bug entries in `BUGS.md`, `BUGS-resolved.md`, and `projecttracking.md` must preserve both identifiers consistently.

### 17B. Before Proposing a Version Bump
1. Read the root `CHANGELOG.md` to find the most recent public version entry.
2. Read `package.json` to check what version is currently deployed.
3. If they differ, flag the discrepancy to the human before proceeding — never silently accept either.
4. Propose the new version number with explicit reasoning: which feature/milestone justifies the MAJOR increment, and what the BUILD segment will be.
5. **Wait for human confirmation** of the proposed version number before writing any file.

### 17C. Applying the Bump (only after human confirms version)
Apply all of the following atomically in one commit:
1. `package.json` — update `"version"` field.
2. Root `CHANGELOG.md` — prepend a new `## [X.XX.XX] — YYYY-MM-DD — FeatureName` entry with concise public-facing release notes.
3. Any in-app version display (e.g. `StatusBar` reads `pkg.version` — no separate update needed as long as `package.json` is correct).

### 17D. If the Human Changes Their Mind Mid-Bump
If the human revises the target version number after a bump has been proposed or partially applied:
1. Immediately stop and revert any partial file changes.
2. Document the version change decision in the root `CHANGELOG.md` under the new entry if the public release note has already been drafted.
3. Re-apply the bump with the corrected number.

### 17E. Compound Version Tag Notation
When a release bundles work from more than one version series simultaneously — e.g. a v3 build that also incorporates a v2 patch — the version is written as a compound tag:

```
PRIMARY_VERSION_COMPOUND_VERSION
e.g.  0.3.01_0.2.03
```

Rules:
- **Primary** (left of `_`) is the highest active series version. This is what `package.json` stores and what the StatusBar displays.
- **Compound** (right of `_`) lists all co-released patches from older series, underscore-separated if more than one (e.g. `0.3.02_0.2.04_0.1.07`).
- The compound tag appears in: `package.json` `"version"` field, root `CHANGELOG.md` entry headers, and any version display in the UI.
- If a release has no cross-series patches, the underscore and suffix are omitted — plain `0.3.02`.
- npm semver does not enforce this format for local packages; this is an MBO convention and will not break install or publish.

### 17F. Patching an Older Version Series (Backport Rule)
Work on an older version series (e.g. fixing the v2 auto-run script while the project is on v3) is handled as follows:

1. **Governance state** — record the work in `projecttracking.md`, `BUGS.md`, and `BUGS-resolved.md` using the appropriate older-series task IDs and bug labels.
2. **package.json** — NEVER regress. It stays at the current highest deployed version. `package.json` represents what is running now, not the older lane being patched internally.
3. **Public changelog** — add or update a root `CHANGELOG.md` entry only if the shipped public version changes.
4. **Confirmation** — the human must explicitly confirm which series a patch targets before the BUILD counter is incremented. Ambiguous requests default to the current version series.

### 17G. Version Drift is a Bug
`package.json` version must always match the most recent root `CHANGELOG.md` entry. Any session that leaves these out of sync has introduced a bug. File it in `BUGS.md` as P1 and link it to a task in `projecttracking.md` before closing.

---

### 17H — Demo Launch Designator: v0.4.0

`v0.4.0` is the public demo launch version of MBO. It is not a `VM.BUILD` dev task ID — it is a release milestone marker that exists outside the standard build counter scheme.

**What it means:** `v0.4.0` ships when and only when the Operator has privately demoed MBO and is personally convinced it is ready for eyes outside the studio. No test result, no agent, and no governance rule triggers this — it is a conviction decision made solely by the Operator.

**How the candidate build sequence works:** After all V4 gate blockers clear, the Operator defines a set of `v0.4.0-RC.x` tasks in `projecttracking.md` at that time. Those tasks represent whatever work is needed to reach a demo-ready state. No `v0.4.0-RC.x` tasks exist in the ledger until the Operator creates them.

**After v0.4.0 ships:** The active development series becomes `v0.41.x` (Module 1). Tasks in `v0.41.x` are created from what surfaces after the public demo — not from internal testing before it. Internal testing before `v0.4.0` produces `v0.11.x`, `v0.2.x`, or `v0.3.x` bugs per normal lane assignment.

**Version artifacts:** `v0.4.0` appears in `package.json` and the root `CHANGELOG.md` as the release version. It carries no BUILD counter suffix.

*Last updated: 2026-03-24 — Restored lane-reset task numbering via VERSIONING.md, clarified `v1.x` task lanes are invalid, and preserved per-lane governance assignment rules.*
