'use strict';

// Layer 2 — EPIPE guard: prevent broken pipe from triggering shutdown()
process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') process.exit(1); });
process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') process.exit(1); });

const http = require('http');
const { randomUUID } = require('crypto');
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

const { DBManager } = require('../state/db-manager.js');
const GraphStore = require('./graph-store.js');
const StaticScanner = require('./static-scanner.js');

// ─── Argument Parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let mode = 'runtime';
  let root = process.cwd();
  for (const arg of args) {
    if (arg.startsWith('--mode=')) mode = arg.split('=')[1];
    else if (arg.startsWith('--root=')) root = arg.split('=')[1];
  }
  return { mode, root };
}

// ─── GraphService Singleton ───────────────────────────────────────────────────
//
// Owns all persistent state: DB, GraphStore, StaticScanner, write queue,
// and the isScanning mutex. All MCP tool calls delegate here.
// Per-session Server shells are thin wrappers that share this instance.

class GraphService {
  constructor(mode, root) {
    this.mode = mode;
    this.root = root;

    // Coarse scan mutex — prevents concurrent full rescans from stepping on each other.
    // Set with a finally block in every scanning tool to guarantee release.
    this.isScanning = false;

    const dbPath = mode === 'dev'
      ? path.join(root, '.dev/data/dev-graph.db')
      : path.join(root, 'data/mirrorbox.db');

    this.db = new DBManager(dbPath);
    this.graphStore = new GraphStore(this.db);
    this.scanner = new StaticScanner(this.graphStore, {
      instanceType: mode,
      scanRoots: [path.join(root, 'src')]
    });

    // Promise-chain write queue — serializes all graph-mutating async operations.
    // better-sqlite3 is synchronous but `await` yield points between DB calls
    // allow the event loop to interleave requests; this queue prevents races.
    this._writeQueue = Promise.resolve();
  }

  // Enqueue a graph-mutating operation. `fn` must return a Promise.
  // Errors are swallowed at the queue boundary to keep the chain alive.
  enqueueWrite(fn) {
    this._writeQueue = this._writeQueue
      .then(fn)
      .catch((err) => {
        console.error(`[GraphService] ${new Date().toISOString()} Write queue error: ${err.message}`);
      });
    return this._writeQueue;
  }

  // ── Tool Definitions ────────────────────────────────────────────────────────

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
      ],
    };
  }

  // ── Tool Dispatch ───────────────────────────────────────────────────────────

  async callTool(name, args) {
    // E1 EXPERIMENT LOGGER — stderr only, does not affect HTTP response stream
    console.error(`[TOOL CALL] ${new Date().toISOString()} ${name} args: ${JSON.stringify(args)}`);

    // Safety: If the graph is still indexing in the background, inform the agent.
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
        // Queued write: scan modified files then enrich
        return this.enqueueWrite(async () => {
          if (this.isScanning) {
            return {
              content: [{ type: 'text', text: 'Scan already in progress. Try again shortly.' }],
              isError: true,
            };
          }
          this.isScanning = true;
          try {
            for (const file of (args.modifiedFiles || [])) {
              const absPath = path.resolve(this.root, file);
              if (fs.existsSync(absPath)) {
                await this.scanner.scanFile(absPath, this.root);
              }
            }
            await this.scanner.enrich(this.root);
            return { content: [{ type: 'text', text: `Graph updated for ${(args.modifiedFiles || []).length} files.` }] };
          } finally {
            this.isScanning = false;
          }
        });
      }

      case 'graph_rescan': {
        // Queued write: full directory rescan
        return this.enqueueWrite(async () => {
          if (this.isScanning) {
            return {
              content: [{ type: 'text', text: 'Scan already in progress. Try again shortly.' }],
              isError: true,
            };
          }
          this.isScanning = true;
          try {
            console.error(`[GraphService] ${new Date().toISOString()} Starting full rescan of src/...`);
            await this.scanner.scanDirectory(path.join(this.root, 'src'), this.root);
            await this.scanner.enrich(this.root);
            console.error(`[GraphService] ${new Date().toISOString()} Rescan complete.`);
            return { content: [{ type: 'text', text: 'Full graph rescan complete.' }] };
          } finally {
            this.isScanning = false;
          }
        });
      }

      case 'graph_ingest_runtime_trace': {
        // Queued write: ingest runtime trace (Task 0.8-07)
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

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  // ── Dev-Mode Initial Scan ───────────────────────────────────────────────────

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

  /**
   * BUG-036: Clean shutdown WAL checkpointing.
   */
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

// ─── Per-Session MCP Shell Factory ───────────────────────────────────────────
//
// Creates a fresh StreamableHTTPServerTransport + thin Server shell per client
// initialize handshake. The shell delegates all tool calls to the shared
// graphService singleton so state is never duplicated across sessions.

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

  // Delegate all requests to the shared GraphService
  mcpShell.setRequestHandler(ListToolsRequestSchema, async () => graphService.listTools());
  mcpShell.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return await graphService.callTool(req.params.name, req.params.arguments);
    } catch (error) {
      if (error instanceof McpError) throw error;
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  });

  // connect() wires the server to the transport (synchronous handler registration,
  // async only for the no-op start()). Await to be safe.
  await mcpShell.connect(transport);
  return transport;
}

// ─── HTTP Server + Session Router ────────────────────────────────────────────

async function main() {
  const { mode, root } = parseArgs();
  const PORT = parseInt(process.env.MBO_PORT || '3737', 10);

  console.error(`[MCP] ${new Date().toISOString()} Starting Graph MCP Server (${mode}) on port ${PORT}...`);

  const graphService = new GraphService(mode, root);

  // sessions: Map<sessionId, StreamableHTTPServerTransport>
  // Populated by onsessioninitialized, cleaned up by onsessionclosed.
  const sessions = new Map();

  const httpServer = http.createServer(async (req, res) => {
    // Route: /mcp only
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found. Use /mcp.' }));
    }

    try {
      if (req.method === 'POST') {
        // Accumulate body before routing
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
          // Route to existing session
          const transport = sessions.get(sessionId);
          if (!transport) {
            // Layer 5 — Transparent session recovery: stale ID after server restart
            console.error(`[MCP] ${new Date().toISOString()} TRANSPARENT_RECOVERY: stale session ${sessionId} — creating new session`);
            const newTransport = await createSession(graphService, mode, sessions);
            return await newTransport.handleRequest(req, res, parsedBody);
          }
          return await transport.handleRequest(req, res, parsedBody);
        }

        // No session ID → new client initializing; create transport + shell
        const transport = await createSession(graphService, mode, sessions);
        return await transport.handleRequest(req, res, parsedBody);

      } else if (req.method === 'GET' || req.method === 'DELETE') {
        // GET (SSE subscription) and DELETE (session close) always require a session ID
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

  // Tune keep-alive to avoid ghost connections hanging on restart
  httpServer.keepAliveTimeout = 30000;
  httpServer.headersTimeout = 35000;

  httpServer.listen(PORT, '127.0.0.1', () => {
    console.error(`[MCP] ${new Date().toISOString()} Graph MCP Server (${mode}) listening on http://127.0.0.1:${PORT}/mcp`);
    // Layer 3 — Startup sentinel: write .dev/run/mcp.ready so session scripts can verify bind
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
            .then(() => {
              console.error(`[MCP] ${new Date().toISOString()} Background initialization complete.`);
            })
            .catch(err => {
              console.error(`[MCP] ${new Date().toISOString()} Background initialization failed:`, err);
            })
            .finally(() => {
              graphService.isScanning = false;
            });
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
