# MCP Port Architecture Reference

**Status:** Current — Canonical
**Last updated:** 2026-03-16 (BUG-078 fix)
**Supersedes:** H23 fixed-port (7337), H30-era docs referencing 7337

---

## The Canonical Architecture (post H30)

Each project runs its own MCP graph daemon on an **ephemeral port** assigned by
the OS at startup (`--port=0`). The daemon writes its actual port to a manifest
file. All clients read that manifest to connect.

**There is no fixed port. 7337 is not the port. Do not hardcode any port.**

---

## Why Ephemeral Ports

Task 1.1-H23 (2026-03-13) introduced launchd + fixed port 7337, designed for
one project per machine.

Task 1.1-H30 (2026-03-15) superseded that with ephemeral ports. Reason: MBO
runs on any software repository. A developer machine may have MBO, johnseriouscom,
MBO_Alpha, and future projects all running simultaneously. They cannot all bind
to 7337. The OS assigns a conflict-free port to each daemon at startup.

---

## How It Works

### Startup

```
mbo setup  →  checks if daemon already healthy (2s)
           →  if healthy: skips restart, refreshes client configs in-place
           →  if not:     spawns: node src/graph/mcp-server.js --port=0 --root=<project>
                          daemon binds OS-assigned port (e.g. 59244)
                          writes manifest: <project>/.dev/run/mcp.json { "port": 59244, ... }
                          daemon writes port to all mcpClients in .mbo/config.json
```

### mcpClients Registry

Agent client configs are driven by `<project>/.mbo/config.json`:

```json
{
  "mcpClients": [
    { "name": "claude", "configPath": ".mcp.json" },
    { "name": "gemini", "configPath": ".gemini/settings.json" }
  ]
}
```

Populated by `mbo setup` from detected CLIs. Adding a new agent = one entry. No code change required.
All paths are project-relative. Full overwrite. Server name always `"mbo-graph"`.

### Manifest location

| Project type | Manifest path |
|---|---|
| Controller repo (MBO itself) | `.dev/run/mcp.json` |
| Subject repo | `.mbo/run/mcp.json` |

### Reading the live port

```bash
# From project root:
node -e 'console.log(require("./.dev/run/mcp.json").port)'

# Health check:
curl http://127.0.0.1:$(node -e 'console.log(require("./.dev/run/mcp.json").port)')/health
```

### Client config (`.mcp.json`, `.gemini/settings.json`)

Written automatically on every daemon startup (including launchd respawn after crash/wake).
Also refreshed by `mbo setup` and `mbo mcp` without restarting a healthy daemon.
Driven by `mcpClients` registry in `.mbo/config.json` — populated by `mbo setup`.

---

## What Each Task Changed

| Task | Date | Port strategy | Status |
|------|------|--------------|--------|
| 1.1-H23 | 2026-03-13 | launchd + fixed 7337 | SUPERSEDED |
| 1.1-H30 | 2026-03-15 | Ephemeral `--port=0` + manifest | CURRENT |
| 1.1-H32 | 2026-03-16 | Auto-write client configs from manifest (`mbo setup`) | COMPLETED |
| BUG-078 | 2026-03-16 | Self-heal configs on every daemon startup + no-churn `mbo mcp` | FIXED |

---

## Recovery

```bash
mbo mcp        # if daemon healthy: refreshes client configs, no restart
               # if daemon unhealthy: full teardown/setup cycle
```

Manual recovery (should never be needed after BUG-078 fix):

```bash
PORT=$(node -e 'console.log(require("./.dev/run/mcp.json").port)')
echo "{\"mcpServers\":{\"mbo-graph\":{\"type\":\"http\",\"url\":\"http://127.0.0.1:${PORT}/mcp\"}}}" > .mcp.json
```

---

## Multi-Project on One Machine

Each project has its own daemon with its own ephemeral port and its own manifest.
They do not conflict. Each client config (`.mcp.json`) is project-scoped and
points to that project's daemon port.

---

## What NOT to Do

- Do not hardcode `7337` anywhere in source code or config
- Do not set `MBO_ALLOW_LEGACY_7337=1` — that env var has been removed
- Do not start the daemon with `--port=7337` — use `--port=0`
- Do not edit `.mcp.json` by hand — use `mbo setup` (post H32)
