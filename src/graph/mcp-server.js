'use strict';

// Layer 2 — EPIPE guard: prevent broken pipe from triggering shutdown()
process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') process.exit(1); });
process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') process.exit(1); });

const http = require('http');
const { randomUUID, createHash } = require('crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');
const path = require('path');
const fs = require('fs');

const eventStore = require('../state/event-store');
const { DBManager } = require('../state/db-manager.js');
const GraphStore = require('./graph-store.js');
const StaticScanner = require('./static-scanner.js');

// ─── Argument Parsing ─────────────────────────────────────────────────────────

// Project root is two levels up from this file's location (src/graph/ → root).
// This is intentional and must not be changed to process.cwd() — the server
// must resolve its root from its own location, not from the launch context.
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function parseArgs() {
  const args = process.argv.slice(2);
  let mode = 'runtime';
  let root = PROJECT_ROOT;
  for (const arg of args) {
    if (arg.startsWith('--mode=')) mode = arg.split('=')[1];
    else if (arg.startsWith('--root=')) root = fs.realpathSync(arg.split('=')[1]);
  }
  return { mode, root };
}

// ─── GraphService Singleton ───────────────────────────────────────────────────

class GraphService {
  constructor(mode, root) {
    this.mode = mode;
    this.root = root;
    this.isScanning = false;

    // project_id: sha256 of the canonical root path (UTF-8 bytes), 16-char hex prefix.
    // UTF-8 encoding is intentional and part of the trust contract — do not change.
    this.projectId = createHash('sha256')
      .update(Buffer.from(this.root, 'utf8'))
      .digest('hex')
      .slice(0, 16);

    const dbPath = mode === 'dev'
      ? path.join(root, '.dev/data/dev-graph.db')
      : path.join(root, 'data/mirrorbox.db');

    this.db = new DBManager(dbPath);
    this.graphStore = new GraphStore(this.db);
    this.scanner = new StaticScanner(this.graphStore, {
      instanceType: mode,
      scanRoots: [path.join(root, 'src')]
    });
    this._writeQueue = Promise.resolve();

    // Read persisted revision from DB synchronously — not lazily — so
    // graph_server_info returns accurate values immediately on startup.
    this.indexRevision = parseInt(this.db.getServerMeta('index_revision', '0'), 10);
    this.lastIndexedAt = this.db.getServerMeta('last_indexed_at', new Date(0).toISOString());
  }

  enqueueWrite(fn) {
    this._writeQueue = this._writeQueue.then(fn).catch((err) => {
      console.error(`[GraphService] ${new Date().toISOString()} Write queue error: ${err.message}`);
      throw err; // re-throw — callers must see failures; queue's job is serialization, not error suppression
    });
    return this._writeQueue;
  }

  listTools() {
    return {
      tools: [
        {
          name: 'graph_query_impact',
          description: 'Given a node ID, return all nodes that would be affected by a change (up to 3 degrees of separation).',
          inputSchema: {
            type: 'object',
            properties: { nodeId: { type: 'string', description: 'The URI ID of the node.' } },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_query_callers',
          description: 'Return all nodes that call a given function.',
          inputSchema: {
            type: 'object',
            properties: { nodeId: { type: 'string', description: 'The URI ID of the node.' } },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_query_dependencies',
          description: 'Return the full dependency chain for a file or function.',
          inputSchema: {
            type: 'object',
            properties: { nodeId: { type: 'string', description: 'The URI ID of the node.' } },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_query_coverage',
          description: 'Return tests that cover a given function or file.',
          inputSchema: {
            type: 'object',
            properties: { nodeId: { type: 'string', description: 'The URI ID of the node.' } },
            required: ['nodeId'],
          },
        },
        {
          name: 'graph_search',
          description: 'Search nodes by name, path, or type.',
          inputSchema: {
            type: 'object',
            properties: { pattern: { type: 'string', description: 'Search pattern for name, path, or id.' } },
            required: ['pattern'],
          },
        },
        {
          name: 'graph_update_task',
          description: 'Update the graph after a task completion by re-scanning modified files.',
          inputSchema: {
            type: 'object',
            properties: {
              modifiedFiles: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of relative file paths that were modified.',
              },
            },
            required: ['modifiedFiles'],
          },
        },
        {
          name: 'graph_rescan',
          description: 'Trigger a full graph rescan of the source directory. Queued — safe to call while another scan may be running.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'graph_ingest_runtime_trace',
          description: 'Ingest a runtime-trace.json produced by the sandbox probe into the Intelligence Graph as runtime-source edges (Task 0.8-07).',
          inputSchema: {
            type: 'object',
            properties: {
              traceFile: { type: 'string', description: 'Relative path to runtime-trace.json from project root.' },
            },
            required: ['traceFile'],
          },
        },
        {
          name: 'get_token_usage',
          description: 'Cumulative token usage per role/model. Optional run_id filter.',
          inputSchema: {
            type: 'object',
            properties: { run_id: { type: 'string', description: 'Optional pipeline run UUID.' } },
          },
        },
        {
          name: 'graph_server_info',
          description: 'Returns server identity and graph freshness metadata. Call at session start to verify the server is scanning the correct project root before issuing any graph queries.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    };
  }

  async callTool(name, args) {
    console.error(`[TOOL CALL] ${new Date().toISOString()} ${name} args: ${JSON.stringify(args)}`);
    if (this.isScanning && name.startsWith('graph_query_')) {
      return {
        content: [{ type: 'text', text: 'INDEXING_IN_PROGRESS: The Intelligence Graph is currently being updated. Please wait 10-20 seconds and retry.' }],
        isError: true,
      };
    }

    switch (name) {
      case 'graph_query_impact': {
        const result = this.graphStore.getGraphQueryResult(args.nodeId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'graph_query_callers': {
        const callers = this.graphStore.getCallers(args.nodeId);
        return { content: [{ type: 'text', text: JSON.stringify(callers, null, 2) }] };
      }
      case 'graph_query_dependencies': {
        const dependencies = this.graphStore.getDependencies(args.nodeId);
        return { content: [{ type: 'text', text: JSON.stringify(dependencies, null, 2) }] };
      }
      case 'graph_query_coverage': {
        const coveringTests = this.graphStore.getCoverage(args.nodeId);
        return { content: [{ type: 'text', text: JSON.stringify(coveringTests, null, 2) }] };
      }
      case 'graph_search': {
        const results = this.graphStore.search(args.pattern);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }
      case 'graph_update_task': {
        return this.enqueueWrite(async () => {
          // No isScanning guard here — enqueueWrite serializes; the flag is never true
          // when reached through the queue. Pre-queue guard in callTool is sufficient.
          this.isScanning = true;
          try {
            for (const file of (args.modifiedFiles || [])) {
              const absPath = path.resolve(this.root, file);
              if (fs.existsSync(absPath)) {
                await this.scanner.scanFile(absPath, this.root);
              }
            }
            await this.scanner.enrich(this.root);
            // Increment only after successful completion — not if enrich() throws.
            this.indexRevision = this.db.incrementIndexRevision();
            this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
            return { content: [{ type: 'text', text: `Graph updated for ${(args.modifiedFiles || []).length} files.` }] };
          } finally {
            this.isScanning = false;
          }
        });
      }
      case 'graph_rescan': {
        return this.enqueueWrite(async () => {
          // No isScanning guard here — enqueueWrite serializes; the flag is never true
          // when reached through the queue. Pre-queue guard in callTool is sufficient.
          this.isScanning = true;
          try {
            console.error(`[GraphService] ${new Date().toISOString()} Starting full rescan of src/...`);
            await this.scanner.scanDirectory(path.join(this.root, 'src'), this.root);
            await this.scanner.enrich(this.root);
            // Increment only after successful completion — not if scanDirectory/enrich throws.
            this.indexRevision = this.db.incrementIndexRevision();
            this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
            console.error(`[GraphService] ${new Date().toISOString()} Rescan complete. index_revision=${this.indexRevision}`);
            return { content: [{ type: 'text', text: 'Full graph rescan complete.' }] };
          } finally {
            this.isScanning = false;
          }
        });
      }
      case 'graph_ingest_runtime_trace': {
        return this.enqueueWrite(async () => {
          const traceAbsPath = path.resolve(this.root, args.traceFile);
          if (!fs.existsSync(traceAbsPath)) {
            return {
              content: [{ type: 'text', text: `Runtime trace not found: ${args.traceFile}` }],
              isError: true,
            };
          }
          await this.scanner.ingestRuntimeTrace(traceAbsPath, this.root);
          return { content: [{ type: 'text', text: `Runtime trace ingested from ${args.traceFile}.` }] };
        });
      }
      case 'get_token_usage': {
        const rows = this.db.getTokenUsage({ runId: args?.run_id });
        const total = rows.reduce(
          (acc, r) => ({ input: acc.input + r.input, output: acc.output + r.output }),
          { input: 0, output: 0 }
        );
        return { content: [{ type: 'text', text: JSON.stringify({ rows, total }, null, 2) }] };
      }
      case 'graph_server_info': {
        // node_count is the pre-scan count when is_scanning=true — correct behavior.
        // Partial scan counts would be misleading; is_scanning=true is the authoritative signal.
        const nodeCount = this.db.get('SELECT COUNT(*) as count FROM nodes').count;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project_root: this.root,
              project_id: this.projectId,
              index_revision: this.indexRevision,
              last_indexed_at: this.lastIndexedAt,
              node_count: nodeCount,
              is_scanning: this.isScanning,
            }, null, 2)
          }]
        };
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  async initDev() {
    const specPath = path.join(this.root, '.dev/spec/SPEC.md');
    if (fs.existsSync(specPath)) {
      console.error(`[GraphService] ${new Date().toISOString()} Indexing SPEC.md...`);
      await this.scanner.scanFile(specPath, this.root);
    }
    console.error(`[GraphService] ${new Date().toISOString()} Scanning src/...`);
    await this.scanner.scanDirectory(path.join(this.root, 'src'), this.root);
    console.error(`[GraphService] ${new Date().toISOString()} Enriching graph (LSP)...`);
    await this.scanner.enrich(this.root);
    console.error(`[GraphService] ${new Date().toISOString()} Dev init complete.`);
  }

  async shutdown() {
    console.error(`[GraphService] ${new Date().toISOString()} Running final WAL checkpoint...`);
    try {
      this.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
      console.error(`[GraphService] ${new Date().toISOString()} Checkpoint complete.`);
    } catch (e) {
      console.error(`[GraphService] ${new Date().toISOString()} Checkpoint failed: ${e.message}`);
    }
  }
}

async function createSession(graphService, mode, sessions) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
      console.error(`[MCP] ${new Date().toISOString()} Session initialized: ${id}`);
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
      console.error(`[MCP] ${new Date().toISOString()} Session closed: ${id}`);
    },
  });

  const mcpShell = new Server(
    { name: `mbo-graph-server-${mode}`, version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  mcpShell.setRequestHandler(ListToolsRequestSchema, async () => graphService.listTools());
  mcpShell.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return await graphService.callTool(req.params.name, req.params.arguments);
    } catch (error) {
      if (error instanceof McpError) throw error;
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  });

  await mcpShell.connect(transport);
  return transport;
}

async function main() {
  const { mode, root } = parseArgs();
  const PORT = parseInt(process.env.MBO_PORT || '3737', 10);
  console.error(`[MCP] ${new Date().toISOString()} Starting Graph MCP Server (${mode}) on port ${PORT}...`);

  const graphService = new GraphService(mode, root);
  const sessions = new Map();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    
    // Section 21: Event Streaming Endpoint (SSE)
    if (url.pathname === '/stream') {
      const targetWorld = url.searchParams.get('world_id');
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      const onEvent = (event) => {
        if (targetWorld && event.world_id !== targetWorld) return;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      res.write(`retry: 10000\n`);
      res.write(`data: ${JSON.stringify({ type: 'connected', world_id: targetWorld || 'all', timestamp: Date.now() })}\n\n`);
      eventStore.on('event', onEvent);
      req.on('close', () => {
        eventStore.removeListener('event', onEvent);
        res.end();
      });
      return;
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found. Use /mcp or /stream.' }));
    }

    try {
      if (req.method === 'POST') {
        let body = '';
        await new Promise((resolve, reject) => {
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', resolve);
          req.on('error', reject);
        });
        let parsedBody;
        try { parsedBody = JSON.parse(body); } catch (_) { parsedBody = undefined; }
        const sessionId = req.headers['mcp-session-id'];
        if (sessionId) {
          const transport = sessions.get(sessionId);
          if (!transport) {
            console.error(`[MCP] ${new Date().toISOString()} TRANSPARENT_RECOVERY: stale session ${sessionId} — creating new session`);
            const newTransport = await createSession(graphService, mode, sessions);
            return await newTransport.handleRequest(req, res, parsedBody);
          }
          return await transport.handleRequest(req, res, parsedBody);
        }
        const transport = await createSession(graphService, mode, sessions);
        return await transport.handleRequest(req, res, parsedBody);
      } else if (req.method === 'GET' || req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'];
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'mcp-session-id header required' }));
        }
        const transport = sessions.get(sessionId);
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Session not found' }));
        }
        return await transport.handleRequest(req, res);
      } else {
        res.writeHead(405, { Allow: 'GET, POST, DELETE' });
        res.end();
      }
    } catch (err) {
      console.error(`[MCP] ${new Date().toISOString()} Request handler error:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  httpServer.keepAliveTimeout = 30000;
  httpServer.headersTimeout = 35000;
  httpServer.listen(PORT, '127.0.0.1', () => {
    console.error(`[MCP] ${new Date().toISOString()} Graph MCP Server (${mode}) listening on http://127.0.0.1:${PORT}/mcp`);
    try {
      const sentinelPath = path.join(root, '.dev/run/mcp.ready');
      fs.writeFileSync(sentinelPath, new Date().toISOString());
    } catch (e) {
      console.error(`[MCP] ${new Date().toISOString()} WARN: Could not write sentinel file: ${e.message}`);
    }
    if (mode === 'dev') {
      try {
        const nodeCount = graphService.db.get('SELECT COUNT(*) as count FROM nodes').count;
        if (nodeCount > 0) {
          console.error(`[MCP] ${new Date().toISOString()} Dev mode: Graph already populated (${nodeCount} nodes). Skipping initial scan.`);
        } else {
          console.error(`[MCP] ${new Date().toISOString()} Dev mode: Starting background initialization...`);
          graphService.isScanning = true;
          graphService.initDev()
            .then(() => { console.error(`[MCP] ${new Date().toISOString()} Background initialization complete.`); })
            .catch(err => { console.error(`[MCP] ${new Date().toISOString()} Background initialization failed:`, err); })
            .finally(() => { graphService.isScanning = false; });
        }
      } catch (e) {
        console.error(`[MCP] ${new Date().toISOString()} Failed to check node count:`, e.message);
      }
    }
  });

  const shutdown = async () => {
    console.error(`[MCP] ${new Date().toISOString()} Shutting down graph server...`);
    for (const transport of sessions.values()) {
      try { await transport.close(); } catch (_) {}
    }
    await graphService.shutdown();
    httpServer.close(() => {
      console.error(`[MCP] ${new Date().toISOString()} HTTP server closed.`);
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    console.error(`[CRITICAL] ${new Date().toISOString()} Uncaught Exception:`, error);
    shutdown();
  });
}

main().catch((err) => {
  console.error(`[FATAL] ${new Date().toISOString()} mcp-server startup failed:`, err);
  process.exit(1);
});
