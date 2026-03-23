## Mirror Box Orchestrator — Outstanding Bugs

**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
**Next bug number:** BUG-195
**Bug ID rule:** `BUG-001`–`BUG-184` are legacy-format entries and must not be renumbered. Starting with `BUG-185`, new bug headings must use dual identification: `BUG-### / vX.Y.ZZ`.
**Version lane rule:** assign the version tag by subsystem, not by the most visible current series. Use `0.11.x` for milestone-1.1 hardening, cleanup, backports, and stabilization of existing runtime/onboarding/bootstrap behavior; `0.12.x` for new graph/runtime intelligence functionality such as graph-server refinement, metadata/context assembly, and knowledge-pack behavior; `0.2.x` for scripting/audit/automation; `0.3.x` for TUI/operator UX; `0.4.x` for multithreading/concurrency. When uncertain, check `.dev/governance/AGENTS.md` Section 17A.1 before assigning the bug's `vX.Y.ZZ` tag.

---
### BUG-194 / v0.11.187: `mbo mcp start` writes launchd plist with KeepAlive=true causing orphan MCP accumulation | Milestone: 1.1 | OPEN
- **Location:** MCP start path (wherever launchd plist registration occurs in `src/`)
- **Severity:** P2
- **Status:** OPEN — 2026-03-23
- **Task:** v0.11.187
- **Description:** Each `mbo mcp start` registers a launchd daemon with `KeepAlive: true`. Processes killed manually are instantly respawned. Over time stale plists accumulate for dead project roots (old worktrees, wrong roots, previous sessions). Manually removed 4 orphan plists today: `johnseriouscom`, home-dir root, `gemini-ux-copy-pack` worktree, `MBO_Alpha`. MCP should be ephemeral — started on demand per session, not supervised by launchd.
- **Acceptance:** `mbo mcp start` must not register a KeepAlive launchd daemon. MCP process lifetime is tied to the `mbo` session that spawned it. Existing orphan-detection/reap logic is sufficient supervision.
