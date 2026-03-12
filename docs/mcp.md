# MBO MCP Server

## Overview

MBO exposes an MCP HTTP endpoint for graph operations.

- Runtime mode: project-scoped endpoint written to `/.mbo/run/mcp.json`
- Dev mode: internal controller endpoint under `.dev/run/`

For runtime usage, treat `/.mbo/run/mcp.json` as the source of truth.

## Runtime Start Flow

```bash
cd /path/to/project
mbo
```

On successful startup, MBO writes:

- `/.mbo/run/mcp.ready`
- `/.mbo/run/mcp.session` (when initialized)
- `/.mbo/run/mcp.json` (endpoint manifest)

## Endpoint Manifest

`/.mbo/run/mcp.json`

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

## Query Helpers

Local helper scripts now use manifest discovery:

- `mcp_query.js`
- `mcp_http_query.js`

Run from the target project root so they can resolve `./.mbo/run/mcp.json`.

## Troubleshooting

1. `ECONNREFUSED` from helper script
- Check `/.mbo/run/mcp.json` exists in the current project.
- Ensure `mbo` is running from that project.

2. `project_id mismatch` in Operator
- Connected MCP belongs to a different project root.
- Restart from the intended project directory.

3. Session-close appears slow
- Session-close and rebuild are timeout-bounded; rerun `mbo` from project root.

## Dev Mode Notes

Dev mode remains internal to controller workflows and may use `.dev/run/*` metadata.
Runtime multi-project behavior is keyed to `/.mbo/run/mcp.json`.
