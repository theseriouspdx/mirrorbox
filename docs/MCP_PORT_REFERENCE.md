# MCP Port Architecture Reference

**Status:** Current — Canonical
**Last updated:** 2026-03-17

## Canonical model

- MCP endpoint is dynamic and project-scoped.
- Do not hardcode ports (including `7337`).
- Endpoint resolution order:
  1. `.dev/run/mcp.json`
  2. `.mbo/run/mcp.json`
  3. PID-scoped manifests
  4. Client configs (`.mcp.json`, `.gemini/settings.json`)

A stale/dangling `mcp.json` symlink is recoverable state.

## Standard recovery

```bash
mbo mcp
```

Expected behavior:
- If daemon is healthy: no teardown/restart, client configs refreshed in-place.
- If daemon is unhealthy: recovery path runs, then configs refreshed.

## Standard validation

Validate with a live tool call from your active client session:

- `mcp_mbo-graph_graph_server_info`
- `mcp_mbo-graph_graph_rescan`

If either call succeeds, MCP is working for that client session.

## Diagnostics helper scope

`node ./scripts/mcp_query.js ...` is a controller-repo helper. Run it from `/Users/johnserious/MBO`.
In subject repos, prefer `mbo mcp` for endpoint recovery/validation.

## What not to do

- Do not use fixed-port assumptions.
- Do not treat `/mcp` as a shell command; it is the HTTP endpoint path.
- Do not gate MCP recovery success on handshake output when MCP tool calls succeed.
