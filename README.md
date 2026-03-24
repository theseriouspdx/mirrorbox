# Mirror Box Orchestrator (MBO)

**Phase 3: Supervised Self-Development (Milestone 1.1+)**

The Mirror Box Orchestrator is a self-referential development environment. It uses a high-integrity pipeline to patch its own codebase and target projects.

## Current Status

- **Phase 1 (Foundations):** Completed
- **Phase 2 (Sovereign Factory):** Completed
- **Sovereign Loop:** Active
- **Milestone 1.1-H23 (MCP daemon migration):** Completed
- **Master Test Suite Hardening (Rules 1/5):** Completed (24/24 scripts compliant)
- **Security Hardening (Inv 13 & 14):** Active (No `write_file` overwrites, Topology-preserving backups to `.dev/bak/`).
- **MCP endpoint:** Project-scoped dynamic (discoverable via `.dev/run/mcp.json` or `.mbo/run/mcp.json`)
- **Onboarding:** Chat-native Operator mode (interactive onboarding handled in the main dialogue loop)

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

MCP is launchd-owned on macOS and binds a project-scoped dynamic port.

```bash
mbo setup
curl http://127.0.0.1:$(node -e 'const fs=require("fs");const f=[".dev/run/mcp.json",".mbo/run/mcp.json"].find(x=>fs.existsSync(x));if(!f){console.error("MCP manifest missing (.dev/run/mcp.json or .mbo/run/mcp.json)");process.exit(1)};console.log(require("./"+f).port)')/health
```

Recovery shortcut:

```bash
mbo mcp
```

To remove:

```bash
mbo teardown
```

Use explicit Node invocation:

```bash
node ./scripts/mcp_query.js tools_list
node ./scripts/mcp_query.js graph_search "open tasks"
```

## Notes

- Do not run runtime `mbo` from the controller repository (guard enforced).
- For MCP troubleshooting, see [`docs/mcp.md`](docs/mcp.md).

## Governance

- `AGENTS.md`: Binding protocol for agent behavior
- `.dev/governance/projecttracking.md`: Authoritative task queue
- `CHANGELOG.md`: Public release notes (minimal, non-canonical)

---

*Stay Vigilant.*


## Installer Flows (No Direct node Launcher)

Use installer scripts instead of `node /path/to/bin/mbo.js`:

```bash
# Install local source globally for developer machine
cd /Users/johnserious/MBO
scripts/mbo-install-local.sh

# Install packaged MBO into Alpha target project
scripts/mbo-install-alpha.sh /Users/johnserious/MBO_Alpha

# Run in Alpha exactly like end user
cd /Users/johnserious/MBO_Alpha
npx mbo
```

Contract: runtime entry is `mbo`/`npx mbo` only. Avoid direct `node .../bin/mbo.js` for validation runs.
