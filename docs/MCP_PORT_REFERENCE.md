# MCP Port Architecture Reference

**Status:** Current — Canonical
**Last updated:** 2026-03-16
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
mbo setup  →  spawns:  node src/graph/mcp-server.js --port=0 --root=<project>
           →  daemon binds OS-assigned port (e.g. 59244)
           →  writes manifest:  <project>/.dev/run/mcp.json  { "port": 59244, ... }
           →  H32 (pending): mbo setup writes port to all client configs
```

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

**Currently:** must be updated manually after `mbo setup` or daemon restart.
**After H32:** `mbo setup` and `mbo mcp` write the correct port automatically.

---

## What Each Task Changed

| Task | Date | Port strategy | Status |
|------|------|--------------|--------|
| 1.1-H23 | 2026-03-13 | launchd + fixed 7337 | SUPERSEDED |
| 1.1-H30 | 2026-03-15 | Ephemeral `--port=0` + manifest | CURRENT |
| 1.1-H32 | pending | Auto-write client configs from manifest | OPEN |

---

## Recovery

```bash
mbo mcp        # restart daemon, manifest updated with new port
               # after H32: also refreshes client configs automatically
```

If the daemon is healthy but the client config is stale (common before H32):

```bash
PORT=$(node -e 'console.log(require("./.dev/run/mcp.json").port)')
# Claude CLI:
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
