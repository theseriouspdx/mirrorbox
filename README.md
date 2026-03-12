# Mirror Box Orchestrator (MBO)

**Phase 3: Supervised Self-Development (Milestone 1.1+)**

The Mirror Box Orchestrator is a self-referential development environment. It uses a high-integrity pipeline to patch its own codebase and target projects.

## Current Status

- **Phase 1 (Foundations):** Completed
- **Phase 2 (Sovereign Factory):** Completed
- **Sovereign Loop:** Active
- **Runtime Stability Hardening:** Active (session-close and stale helper recovery)
- **Project-Scoped MCP Endpoint:** Active for runtime mode

## Usage

```bash
# Reinstall global CLI from local repo
cd /Users/johnserious/MBO
npm install -g .

# Run from a target project (not from /Users/johnserious/MBO)
cd /path/to/project
mbo
```

## Runtime MCP Discovery

Runtime MCP no longer relies on a fixed global port contract in helper scripts.

When `mbo` starts in a target project, it writes a project-local manifest:

- `/.mbo/run/mcp.json`

Example:

```json
{
  "url": "http://127.0.0.1:<port>/mcp",
  "port": 12345,
  "pid": 99999,
  "mode": "runtime",
  "project_root": "/abs/project/root",
  "project_id": "<sha16>",
  "started_at": "2026-03-12T12:00:00.000Z"
}
```

The local helpers (`mcp_query.js`, `mcp_http_query.js`) now read this manifest to resolve endpoint/port.

## Notes

- Do not run runtime `mbo` from `/Users/johnserious/MBO` (controller repo guard).
- If a session appears stale, simply run `mbo` again from the target project; startup now includes stale-helper recovery.

## Governance

- `AGENTS.md`: Binding protocol for agent behavior
- `.dev/governance/projecttracking.md`: Authoritative task queue
- `.dev/governance/CHANGELOG.md`: Historical change log

---

*Stay Vigilant.*
