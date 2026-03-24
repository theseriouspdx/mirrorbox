# /graph — MBO Graph Server Setup & Verification

Ensure the MBO graph server is running and registered as an MCP tool for this session.
Run the following steps in order and report the result of each.

## Step 1 — Check server health

Run:
```
node scripts/graph_call.js graph_server_info
```

If this succeeds, skip to Step 3. If it fails with a connection error, proceed to Step 2.

## Step 2 — Start the graph server

Run:
```
mbo mcp start
```

Wait up to 10 seconds, then re-run `node scripts/graph_call.js graph_server_info` to confirm it came up.
If it still fails, report the error and stop — the operator needs to investigate.

## Step 3 — Regenerate .mcp.json from the runtime manifest

The graph server port is dynamic. Read the actual port from the runtime manifest:
```
node -e "console.log(require('./.dev/run/mcp.json').port)"
```

Then write (or overwrite) `.mcp.json` in the project root using that port:
```json
{
  "mcpServers": {
    "mbo-graph": {
      "type": "http",
      "url": "http://127.0.0.1:<PORT>/mcp",
      "timeout": 30000
    }
  }
}
```

Do this in one node command to avoid hardcoding:
```
node -e "
  const port = require('./.dev/run/mcp.json').port;
  const fs = require('fs');
  fs.writeFileSync('.mcp.json', JSON.stringify({
    mcpServers: { 'mbo-graph': { type: 'http', url: 'http://127.0.0.1:' + port + '/mcp', timeout: 30000 } }
  }, null, 2));
  console.log('[graph] .mcp.json written — port', port);
"
```

This file is gitignored intentionally (port is dynamic). It must be regenerated each session from the manifest.

## Step 4 — Patch settings.local.json

Read `.claude/settings.local.json`. If `enabledMcpjsonServers` does not contain `"mbo-graph"`, add it.
The file must contain at minimum:
```json
{
  "enabledMcpjsonServers": ["mbo-graph"]
}
```
Preserve any existing `permissions` or other keys — merge, do not overwrite.

## Step 5 — Confirm and report

Run:
```
node scripts/graph_call.js graph_server_info
```

Report:
- Graph server version, node count, last scan time
- Confirmation that `.mcp.json` is present and correct
- Confirmation that `settings.local.json` includes `mbo-graph`
- Any warnings (e.g. stale index, rescan recommended)

If all steps pass, state: **Graph server ready. Use `graph_get_knowledge_pack`, `graph_search`, and `graph_query_callers` instead of raw file reads.**
