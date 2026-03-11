# MBO MCP Server

## Overview

The MBO MCP server exposes the dev-graph database to AI agents via the Model Context Protocol (MCP). It runs on **StreamableHTTP transport** at `http://localhost:3737/mcp`.

---

## Starting the Server

```bash
# Direct start (respects MBO_PORT env var)
node src/mcp/mcp-server.js

# Via process manager script
bash scripts/mbo-start.sh --mode=dev --agent=operator

# Via launchd (auto-start on login)
bash scripts/mbo-launchd-install.sh install
```

Port defaults to `3737`. Override with `MBO_PORT=<port>`.

---

## launchd Service

Install as a macOS LaunchAgent (auto-starts on login):

```bash
bash scripts/mbo-launchd-install.sh install    # install & load
bash scripts/mbo-launchd-install.sh uninstall  # unload & remove
bash scripts/mbo-launchd-install.sh status     # check if loaded
```

Logs:
- stdout: `.dev/logs/mcp.out`
- stderr: `.dev/logs/mcp.err`

The install script generates `scripts/com.mbo.mcp.plist` from `scripts/com.mbo.mcp.plist.template` using your current `$HOME`, `$MBO_ROOT`, and active node binary path. The generated file is git-ignored.

---

## Available Tools

All tools query `.dev/data/dev-graph.db` (the dev-graph, not the runtime mirrorbox.db).

### `graph_search`

Full-text search across nodes and relationships.

```json
{ "query": "handshake" }
```

Returns: matching nodes, their types, IDs, and relationship summaries.

### `graph_query_impact`

Find everything a node affects (downstream impact).

```json
{ "node_id": "handshake.py" }
```

### `graph_query_dependencies`

Find everything a node depends on (upstream dependencies).

```json
{ "node_id": "operator.js" }
```

### `graph_query_callers`

Find all nodes that call or reference a given node.

```json
{ "node_id": "eventStore.append" }
```

### `graph_query_coverage`

Show test coverage relationships for a node.

```json
{ "node_id": "src/relay/guard.js" }
```

### `graph_rescan`

Re-index the source tree into the dev-graph. Run this at the start of each session.

```json
{}
```

### `graph_update_task`

Mark a task node as complete in the dev-graph.

```json
{ "task_id": "1.0-06", "status": "COMPLETE" }
```

---

## MCP Config (`.mcp.json`)

The `.mcp.json` file is machine-local (git-ignored). See `.dev/governance/AGENTS.md` Section 11 for setup instructions.

Claude Code example entry:

```json
{
  "mcpServers": {
    "mbo": {
      "type": "http",
      "url": "http://localhost:3737/mcp"
    }
  }
}
```

Gemini CLI example (see AGENTS.md §11 for full config).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Connection refused` on port 3737 | `node src/mcp/mcp-server.js` to start manually; check `.dev/logs/mcp.err` |
| Graph returns empty results | Run `graph_rescan` first |
| launchd not starting node | Re-run install script to regenerate plist with correct node path |
| Wrong node version in launchd | `bash scripts/mbo-launchd-install.sh install` re-detects current node |
