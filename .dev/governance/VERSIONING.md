# VERSIONING.md
## MBO Canonical Task And Lane Scheme

Status: Read-only governance reference.
Purpose: Define the canonical task-lane numbering model independently of AGENTS.md so agents and humans have one stable reference for lane assignment and task numbering.

---

## 1. Canonical Task ID Shape

Task IDs use:

`v0.LL.NN`

Where:
- `0` is the repo stability epoch.
- `LL` is the two-digit lane or module identifier.
- `NN` is the zero-padded task sequence within that lane.

Examples:
- `v0.12.01`
- `v0.13.02`
- `v0.14.08`
- `v0.15.06`
- `v0.41.02`

## 2. Reset Rule

The number after the second decimal resets within each lane.

Examples:
- `v0.13.01`, `v0.13.02`, `v0.13.03`
- `v0.14.01`, `v0.14.02`, `v0.14.03`

A `v0.14.02` task does not imply anything about the next `v0.13.x` or `v0.15.x` task number.

## 3. Invalid Lanes

Invalid for internal task/governance lanes:
- `v1.x`

Valid internal lanes include `v0.10.x`, `v0.11.x`, `v0.12.x`, `v0.13.x`, `v0.14.x`, `v0.15.x`, `v0.16.x`, and `v0.41.x+` where explicitly defined.

## 4. Lane Definitions

- `0.10.x` — Milestone 1.0 / sovereign-loop family.
- `0.11.x` — milestone-1.1 hardening, cleanup, backports, runtime reliability corrections, onboarding/root/bootstrap fixes, and stabilization of existing behavior.
- `0.12.x` — graph/runtime intelligence refinement, graph-server capability expansion, context-assembly upgrades, metadata/knowledge-pack behavior, and related backend intelligence work.
- `0.13.x` — proprietary boundary, governance-scope, setup/config policy, and other boundary-definition work.
- `0.14.x` — operator logic refinement, DID chooser/routing, tiebreakers, blast-radius policy, human-in-the-loop gates, and other execution-flow logic.
- `0.15.x` — cleanup/hardening module tasks explicitly defined by the V4 cleanup gate.
- `0.16.x` — CYNIC tax / per-session maintenance workflow design.
- `0.2.x` — scripting, workflow audit, automation, artifact generation, and auto-run tooling.
- `0.3.x` — TUI, operator-facing terminal UX, panel behavior, overlays, visual state, and other UI work.
- `0.4.0` — demo launch milestone marker, not a normal internal task lane.
- `0.41.x`, `0.42.x`, ... — V4 module work after the gate is cleared and the operator explicitly opens that lane.

## 5. Assignment Rule

Assign the lane by subsystem/module intent, not by whichever series is currently most visible in the repo.

Examples:
- Graph MCP refinement belongs in `0.12.x`.
- DID/tiebreaker/operator gate logic belongs in `0.14.x`.
- Cleanup gate execution tasks belong in `0.15.x`.

## 6. Known Current Mapping Correction

The 2026-03-23 cowork audit follow-up tasks were briefly parked in `v0.11.193`–`v0.11.201` after invalid `v1.0.x` drift was purged. Canonical mapping is:

- `v0.13.02` — config roles / setup migration
- `v0.13.03` — `readOnlyWorkflow` disposition
- `v0.14.02` — DID Gate 2 blind consensus
- `v0.14.03` — DID rounds 3-4 isolation
- `v0.14.04` — Stage 4.5 real dry run
- `v0.14.05` — Stage 10 smoke test / retry gate
- `v0.14.06` — vendor diversity enforcement
- `v0.14.07` — audit gate timing
- `v0.14.08` — convergence detection semantics

## 7. Relationship To AGENTS.md

- `AGENTS.md` defines workflow behavior and enforcement.
- `VERSIONING.md` is the read-only numbering and lane reference.
- If the two conflict, governance must be reconciled explicitly rather than inferred silently.
