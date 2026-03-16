# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** 2026-03-16
**Last task:** 1.1-H31 COMPLETED + .gitignore fix + H32/BUG-074 registered
**Branch:** master (clean)

---

## Section 1 — Next Action

**Implement Task 1.1-H32** — agnostic MCP client config + scan root detection.

### Scope (branch: `claude/h32-setup-agnostic`):

**Part 1 — `mcp-server.js` scan root config (Tier 1):**
- Read `scanRoots` from `<project>/.mbo/config.json`
- Fall back to `['src']` if absent/malformed
- Single change in `GraphService` constructor (~10 lines)

**Part 2 — `setup.js` client config registry + scan root detection (Tier 1-2):**
- After daemon healthy: read port from manifest, write MCP URL to all detected clients:
  - Claude CLI → `.mcp.json`
  - Gemini CLI → `.gemini/settings.json`
  - Codex → investigate config location first
  - Extensible registry (adding new client = one entry)
- Scan root detection: walk project root, surface candidate dirs by heuristic
  (presence of src/, lib/, js/, py files, *.ts, package.json, pyproject.toml, etc.)
  prompt user to confirm, write `scanRoots` to `<project>/.mbo/config.json`
- `mbo mcp` recovery must also refresh client configs (ephemeral port changes on restart)

**Part 3 — after H32 ships:**
- `mbo setup` in `/Users/johnserious/johnseriouscom`
- `mbo setup` in `/Users/johnserious/MBO_Alpha`
- Verify both graph servers show `completed` scan status

### Gate 0 graph queries:
```
graph_server_info()
graph_search("setup installMCPDaemon client config")
graph_search("mcp-server scanRoots GraphService")
```

---

## Section 2 — State Summary

### Completed this session:
- H31 VERIFIED + PROMOTED to master — ON DELETE CASCADE fix, MBO scan clean (0 failures, 514 nodes)
- .gitignore: session.lock, write.deny, mcp-*.json, scripts/scratch/ now ignored
- BUG-073 RESOLVED, BUG-074 OPEN, H32 registered with full scope

### Active P0 bugs:
- BUG-074: mbo setup doesn't write client configs or detect scan roots → H32

### MCP status:
- MBO daemon (30f5c136): ✅ port 59244, scan completed, 514 nodes
- johnseriouscom daemon (b6e69750): ❌ failed_critical, 0 nodes — no src/ dir, blocked on H32
- MBO_Alpha daemon: ❌ not installed — blocked on H32
- All client MCP configs: ❌ stale/manual — blocked on H32

---

## Section 3 — Directory State

- Branch: master
- Last commit: 89cf42a — chore: register BUG-074 and expand H32 scope
- Working tree: clean
- MCP daemon (MBO): running on port 59244, healthy
