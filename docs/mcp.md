# MBO Graph Server — MCP Reference

## Architecture (as of 2026-03-13)

The MBO graph server is a **launchd-owned system daemon**. It runs at login,
restarts automatically on crash, and is available at a project-scoped dynamic address.
MBO the CLI tool is a client. It does not start, stop, or manage the server.

**Endpoint:** Dynamic loopback (discoverable via `.dev/run/mcp.json` or `.mbo/run/mcp.json`)
**Health check:** `GET http://127.0.0.1:<PORT>/health`

Manifest-based port discovery. No session negotiation.

---

## Setup (macOS)

```bash
mbo setup
```

This installs the launchd plist and starts the server. Run once after install.
The server will start automatically at every login from that point forward.

To verify it's running:
```bash
# Get port from manifest
PORT=$(node -e 'console.log(require("./.dev/run/mcp.json").port)')
curl http://127.0.0.1:$PORT/health
launchctl list | grep mbo
```

To remove:
```bash
mbo teardown
```

---

## Client Configuration

`.mcp.json` (Claude CLI):
```json
{
  "mcpServers": {
    "mbo-graph": {
      "url": "http://127.0.0.1:PORT/mcp"
    }
  }
}
```

`.gemini/settings.json` (Gemini CLI):
```json
{
  "mcpServers": {
    "mbo-graph": {
      "url": "http://127.0.0.1:PORT/mcp"
    }
  }
}
```

Both files are managed by MBO and reflect the manifest-discovered port.

---

## Querying

```bash
node ./scripts/mcp_query.js graph_server_info
node ./scripts/mcp_query.js graph_search "open tasks"
node ./scripts/mcp_query.js tools_list
```

### One-command recovery

If MCP is flaky or launchd/session state drifted, run:

```bash
mbo mcp
```

This runs teardown/setup, waits for health, runs `graph_rescan`, prints
`graph_server_info`, refreshes local handshake baseline, and checks SQLite
integrity.

---

## Docker / CI Environments

launchd is not available in Docker or CI. Use the thin wrapper:

```bash
./scripts/mbo-ci-start.sh
# then run your agents
```

This starts the server, waits for `/health`, and exits. It is not a supervisor.
If the server crashes during your job, agents will get connection refused. That
is the correct behavior — restart the wrapper.

For CI pipelines (GitHub Actions example):
```yaml
- name: Start MBO graph server
  run: ./scripts/mbo-ci-start.sh &
- name: Run agents
  run: your-agent-command
```

---

## Linux / Windows

Current `mbo setup` / `mbo teardown` implementation is launchd-focused (macOS).
For Linux/Windows, run MCP in-process for CI/dev via:

```bash
./scripts/mbo-ci-start.sh
```

Systemd/Windows service installers are not part of this task's implementation.

---

## Troubleshooting

**`Connection refused` on dynamic port**
Server is not running. On macOS:
```bash
launchctl load -w ~/Library/LaunchAgents/com.mbo.mcp.plist
```
Or run `mbo setup` again.

**Need full reset + verification in one command**
```bash
mbo mcp
```
This is the preferred first-line recovery flow.

**Server crashes in a loop**
Check logs: `tail -f .dev/logs/mcp-stderr.log`
launchd will back off after repeated crashes (ThrottleInterval: 10s).

**Agent connects to wrong project**
The server enforces project_id isolation. If your agent is hitting the wrong
project, check that it is running from the correct project root. The server
will reject RPC requests from unmatched project contexts.

**Checking server identity**
```bash
node ./scripts/mcp_query.js graph_server_info
```
Returns: `project_root`, `project_id`, `uptime`, `node_count`, `is_scanning`.

---

## What no longer exists

The following were removed in Milestone 1.1-H23:

- `scripts/mbo-start.sh` — replaced by launchd
- `scripts/mbo-watchdog.sh` — replaced by launchd KeepAlive
- `src/utils/resolve-manifest.js` — legacy path
- `.mbo/run/mcp.json` manifest files — legacy path
- `.mbo/run/mcp.ready` sentinel files — no sentinel polling
- Dynamic port selection — port is project-scoped dynamic
- Session ID persistence/restore — stateless per-request

*Last updated: 2026-03-13*
