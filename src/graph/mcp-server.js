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
  let port = 7337;
  for (const arg of args) {
    if (arg.startsWith('--mode=')) mode = arg.split('=')[1];
    else if (arg.startsWith('--port=')) port = parseInt(arg.split('=')[1], 10) || 7337;
    else if (arg.startsWith('--root=')) {
      const rawRoot = arg.split('=')[1];
      // Canonicalize when available to align with operator-side root checks.
      // If realpath is unavailable (late mounts), keep provided root non-fatally.
      try { root = fs.realpathSync(rawRoot); }
      catch { root = rawRoot; }
    }
  }
  return { mode, root, port };
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
      : path.join(root, '.mbo/mirrorbox.db');

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
    this.lastScanStatus = this.db.getServerMeta('last_scan_status', 'unknown');
    this.lastScanFailedFiles = parseInt(this.db.getServerMeta('last_scan_failed_files', '0'), 10) || 0;
    this.lastScanCriticalFailures = parseInt(this.db.getServerMeta('last_scan_critical_failures', '0'), 10) || 0;
    this.lastScanInputMtimeMs = parseInt(this.db.getServerMeta('last_scan_input_mtime_ms', '0'), 10) || 0;
  }

  _computeScanInputSignal(maxFiles = 5000) {
    const srcPath = path.join(this.root, 'src');
    const specPath = path.join(this.root, '.dev/spec/SPEC.md');
    let latestInputMtimeMs = 0;
    let scannedFiles = 0;
    let truncated = false;

    const statMtime = (targetPath) => {
      try {
        return fs.statSync(targetPath).mtimeMs || 0;
      } catch (_) {
        return 0;
      }
    };

    const stack = [srcPath];
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);
    while (stack.length > 0) {
      const dirPath = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (_) {
        continue;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) {
            stack.push(path.join(dirPath, entry.name));
          }
          continue;
        }

        scannedFiles += 1;
        if (scannedFiles > maxFiles) {
          truncated = true;
          break;
        }

        const mtime = statMtime(path.join(dirPath, entry.name));
        if (mtime > latestInputMtimeMs) latestInputMtimeMs = mtime;
      }

      if (truncated) break;
    }

    const specMtimeMs = statMtime(specPath);
    if (specMtimeMs > latestInputMtimeMs) {
      latestInputMtimeMs = specMtimeMs;
    }

    return {
      latest_input_mtime_ms: Math.floor(latestInputMtimeMs),
      scanned_files_for_signal: scannedFiles,
      signal_truncated: truncated,
    };
  }

  _summarizeAndPersistScan(diagnostics, trigger) {
    const failedFiles = diagnostics.failedFiles || [];
    // BUG-072: Enrich failures are best-effort warnings, not critical failures.
    // failed_critical is reserved for static scan failures only.
    const criticalFailures = failedFiles.filter((f) => f.path !== '<enrich>').length;
    const status = criticalFailures > 0
      ? 'failed_critical'
      : (failedFiles.length > 0 ? 'completed_with_warnings' : 'completed');
    const inputSignal = this._computeScanInputSignal();

    this.lastScanStatus = status;
    this.lastScanFailedFiles = failedFiles.length;
    this.lastScanCriticalFailures = criticalFailures;
    this.lastScanInputMtimeMs = Number(inputSignal.latest_input_mtime_ms || 0);

    this.db.setServerMeta('last_scan_status', status);
    this.db.setServerMeta('last_scan_failed_files', this.lastScanFailedFiles);
    this.db.setServerMeta('last_scan_critical_failures', this.lastScanCriticalFailures);
    this.db.setServerMeta('last_scan_input_mtime_ms', this.lastScanInputMtimeMs);

    return {
      status,
      trigger,
      scanned_files: diagnostics.scannedFiles,
      failed_files: this.lastScanFailedFiles,
      critical_failures: this.lastScanCriticalFailures,
      index_revision: this.indexRevision,
      last_indexed_at: this.lastIndexedAt,
      latest_input_mtime_ms: this.lastScanInputMtimeMs,
      signal_truncated: inputSignal.signal_truncated,
      failures: failedFiles.slice(0, 25),
    };
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
            console.error(`[GraphService] ${new Date().toISOString()} Starting full rescan of SPEC.md + src/...`);

            const diagnostics = {
              scannedFiles: 0,
              failedFiles: [],
            };

            const specPath = path.join(this.root, '.dev/spec/SPEC.md');
            if (fs.existsSync(specPath)) {
              try {
                await this.scanner.scanFile(specPath, this.root);
                diagnostics.scannedFiles += 1;
              } catch (e) {
                diagnostics.failedFiles.push({
                  path: '.dev/spec/SPEC.md',
                  error: e.message,
                });
              }
            }

            await this.scanner.scanDirectorySafe(path.join(this.root, 'src'), this.root, diagnostics);
            try {
              await this.scanner.enrich(this.root);
            } catch (e) {
              diagnostics.failedFiles.push({
                path: '<enrich>',
                error: e.message,
              });
            }
            // Increment only after successful completion — not if scanDirectory/enrich throws.
            this.indexRevision = this.db.incrementIndexRevision();
            this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
            console.error(`[GraphService] ${new Date().toISOString()} Rescan complete. index_revision=${this.indexRevision}`);

            const summary = this._summarizeAndPersistScan(diagnostics, 'manual_rescan');

            return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
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
              last_scan_status: this.lastScanStatus,
              last_scan_failed_files: this.lastScanFailedFiles,
              last_scan_critical_failures: this.lastScanCriticalFailures,
              last_scan_input_mtime_ms: this.lastScanInputMtimeMs,
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

  async autoRefreshDevIfStale() {
    const epoch = new Date(0).toISOString();
    const srcPath = path.join(this.root, 'src');
    const specPath = path.join(this.root, '.dev/spec/SPEC.md');
    let srcMtimeMs = 0;
    let specMtimeMs = 0;
    try {
      srcMtimeMs = fs.statSync(srcPath).mtimeMs || 0;
    } catch (_) {
      srcMtimeMs = 0;
    }
    try {
      specMtimeMs = fs.statSync(specPath).mtimeMs || 0;
    } catch (_) {
      specMtimeMs = 0;
    }

    const inputSignal = this._computeScanInputSignal();

    const lastIndexedMs = Date.parse(this.lastIndexedAt || epoch);
    const needsRefresh =
      this.indexRevision <= 0 ||
      !this.lastIndexedAt ||
      this.lastIndexedAt === epoch ||
      !Number.isFinite(lastIndexedMs) ||
      (srcMtimeMs > 0 && lastIndexedMs < srcMtimeMs) ||
      (specMtimeMs > 0 && lastIndexedMs < specMtimeMs) ||
      (Number(inputSignal.latest_input_mtime_ms || 0) > Number(this.lastScanInputMtimeMs || 0));

    if (!needsRefresh) {
      console.error(`[MCP] ${new Date().toISOString()} Dev mode: Graph freshness OK (index_revision=${this.indexRevision}, last_scan_status=${this.lastScanStatus}).`);
      return;
    }

    console.error(`[MCP] ${new Date().toISOString()} Dev mode: Graph stale/uninitialized — running auto graph_rescan...`);
    return this.enqueueWrite(async () => {
      this.isScanning = true;
      try {
        const diagnostics = {
          scannedFiles: 0,
          failedFiles: [],
        };

        if (fs.existsSync(specPath)) {
          try {
            await this.scanner.scanFile(specPath, this.root);
            diagnostics.scannedFiles += 1;
          } catch (e) {
            diagnostics.failedFiles.push({ path: '.dev/spec/SPEC.md', error: e.message });
          }
        }

        await this.scanner.scanDirectorySafe(srcPath, this.root, diagnostics);
        try {
          await this.scanner.enrich(this.root);
        } catch (e) {
          diagnostics.failedFiles.push({ path: '<enrich>', error: e.message });
        }

        this.indexRevision = this.db.incrementIndexRevision();
        this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
        const summary = this._summarizeAndPersistScan(diagnostics, 'dev_auto_refresh');
        console.error(
          `[MCP] ${new Date().toISOString()} Dev auto-refresh complete. index_revision=${this.indexRevision}, status=${summary.status}, scanned=${summary.scanned_files}, failed=${summary.failed_files}, critical=${summary.critical_failures}`
        );
      } finally {
        this.isScanning = false;
      }
    });
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

function isSocketGone(req, res) {
  return Boolean(req.destroyed || req.aborted || res.destroyed || res.writableEnded);
}

function isStreamDestroyedError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return (
    err.code === 'ERR_STREAM_DESTROYED' ||
    err.code === 'ERR_HTTP_HEADERS_SENT' ||
    /stream was destroyed/i.test(msg) ||
    /write after end/i.test(msg)
  );
}

async function safeHandleTransportRequest(transport, req, res, parsedBody) {
  if (isSocketGone(req, res)) return;
  try {
    if (typeof parsedBody === 'undefined') return await transport.handleRequest(req, res);
    return await transport.handleRequest(req, res, parsedBody);
  } catch (err) {
    if (isStreamDestroyedError(err) && isSocketGone(req, res)) {
      console.error(`[MCP] ${new Date().toISOString()} Suppressed late write on closed stream: ${err.message}`);
      return;
    }
    throw err;
  }
}

function safeSSEWrite(res, data) {
  if (res.destroyed || res.writableEnded) return false;
  try { res.write(data); return true; } catch (_) { return false; }
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
  const { mode, root, port } = parseArgs();
  const PORT = Number.isFinite(port) ? port : 7337;

  console.error(`[MCP] ${new Date().toISOString()} Starting Graph MCP Server (${mode}) on port ${PORT}...`);

  const graphService = new GraphService(mode, root);
  const sessions = new Map();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'ok',
        project_root: root,
        uptime: Math.floor(process.uptime()),
      }));
    }
    
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
        if (res.destroyed || res.writableEnded) {
          eventStore.removeListener('event', onEvent);
          return;
        }
        if (targetWorld && event.world_id !== targetWorld) return;
        safeSSEWrite(res, `data: ${JSON.stringify(event)}\n\n`);
      };
      safeSSEWrite(res, `retry: 10000\n`);
      safeSSEWrite(res, `data: ${JSON.stringify({ type: 'connected', world_id: targetWorld || 'all', timestamp: Date.now() })}\n\n`);
      eventStore.on('event', onEvent);
      req.on('close', () => {
        eventStore.removeListener('event', onEvent);
        if (!res.destroyed && !res.writableEnded) res.end();
      });
      return;
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found. Use /mcp, /stream, or /health.' }));
    }

    try {
      if (req.method === 'POST') {
        const sessionId = req.headers['mcp-session-id'];

        if (sessionId) {
          const transport = sessions.get(sessionId);
          if (!transport) {
            console.error(`[MCP] ${new Date().toISOString()} TRANSPARENT_RECOVERY: stale session ${sessionId} — creating new session`);
            const newTransport = await createSession(graphService, mode, sessions);
            return await safeHandleTransportRequest(newTransport, req, res);
          }
          return await safeHandleTransportRequest(transport, req, res);
        }

        // No session header: treat as fresh/initialize flow on a new transport.
        const transport = await createSession(graphService, mode, sessions);
        return await safeHandleTransportRequest(transport, req, res);
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
        return await safeHandleTransportRequest(transport, req, res);
      } else {
        res.writeHead(405, { Allow: 'GET, POST, DELETE' });
        res.end();
      }
    } catch (err) {
      if (isStreamDestroyedError(err) && isSocketGone(req, res)) {
        console.error(`[MCP] ${new Date().toISOString()} Ignoring request error on closed stream: ${err.message}`);
        return;
      }
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
    if (mode === 'dev') {
      graphService.autoRefreshDevIfStale()
        .catch((err) => {
          console.error(`[MCP] ${new Date().toISOString()} Dev auto-refresh failed:`, err.message);
        });
    }
  });

  const shutdown = async (reason = null) => {
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

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
process.on('uncaughtException', (error) => {
    const message = String((error && error.message) || error || 'uncaught_exception');
    if (isStreamDestroyedError(error)) {
      // LSP/jsonrpc layers may emit stream-destroyed during shutdown/reconnect windows.
      // This is noisy but non-fatal to MCP HTTP serving; do not kill the server.
      console.error(`[MCP] ${new Date().toISOString()} Suppressed non-fatal stream error in uncaughtException: ${message}`);
      return;
    }
    console.error(`[CRITICAL] ${new Date().toISOString()} Uncaught Exception:`, error);
    shutdown(message);
  });
}

main().catch((err) => {
  console.error(`[FATAL] ${new Date().toISOString()} mcp-server startup failed:`, err);
  process.exit(1);
});
