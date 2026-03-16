# Mirror Box Orchestrator (MBO)

**Phase 3: Supervised Self-Development (Milestone 1.1+)**

The Mirror Box Orchestrator is a self-referential development environment. It uses a high-integrity pipeline to patch its own codebase and target projects.

## Current Status

- **Phase 1 (Foundations):** Completed
- **Phase 2 (Sovereign Factory):** Completed
- **Sovereign Loop:** Active
- **Milestone 1.1-H23 (MCP daemon migration):** Completed
- **Security Hardening (Inv 13 & 14):** Active (No `write_file` overwrites, Topology-preserving backups to `.dev/bak/`).
- **MCP endpoint:** `http://127.0.0.1:7337/mcp`

## Usage

```bash
# Reinstall global CLI from local repo
cd /path/to/mbo
npm install -g .

# Run from a target project (not from the MBO controller repo)
cd /path/to/project
mbo
```

## MCP Daemon

MCP is launchd-owned on macOS and binds fixed port `7337`.

```bash
mbo setup
curl http://127.0.0.1:7337/health
```

To remove:

```bash
mbo teardown
```

Use explicit Node invocation:

```bash
node ./mcp_query.js tools_list
node ./mcp_query.js graph_search "open tasks"
```

## Notes

- Do not run runtime `mbo` from the controller repository (guard enforced).
- For MCP troubleshooting, see [`docs/mcp.md`](docs/mcp.md).

## Governance

- `AGENTS.md`: Binding protocol for agent behavior
- `.dev/governance/projecttracking.md`: Authoritative task queue
- `.dev/governance/CHANGELOG.md`: Historical change log

---

*Stay Vigilant.*
