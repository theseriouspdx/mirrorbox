# MBO Graph Server — MCP Reference

## Architecture (current)

MBO uses a project-scoped MCP daemon with a dynamic port. The live endpoint is resolved from manifests (with PID-scoped fallback), then client configs.

Primary recovery command:

```bash
mbo mcp
```

`mbo mcp` handles health/recovery and rewrites registered client configs (`.mcp.json`, `.gemini/settings.json`) to the live port.

## Validation (canonical)

After `mbo mcp`, validate by executing a live MCP tool call:

- `mcp_mbo-graph_graph_server_info`
- `mcp_mbo-graph_graph_rescan`

If one of those succeeds, MCP is operational for that session.

## Optional diagnostics

From the MBO controller repo (`/Users/johnserious/MBO`):

```bash
node ./scripts/mcp_query.js --diagnose graph_server_info
node ./scripts/mcp_query.js tools_list
```

In subject repos, `scripts/mcp_query.js` may not exist. Use `mbo mcp` there.

## Client behavior notes

- Gemini CLI can reload MCP in-session (`/mcp refresh`), but this is fallback.
- If tool calls already succeed after `mbo mcp`, refresh is not required.

## Troubleshooting

- `MODULE_NOT_FOUND .../scripts/mcp_query.js`:
  - You ran debug helper commands outside the MBO controller repo.
  - Use `mbo mcp` in that repo, or run the script from `/Users/johnserious/MBO`.
- `handshake_status` warnings during `mbo mcp`:
  - This is handshake/session state, not MCP endpoint failure.
  - Treat MCP as healthy when MCP tool calls succeed.

*Last updated: 2026-03-17*
