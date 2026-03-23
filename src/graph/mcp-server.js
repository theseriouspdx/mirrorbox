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
const { execSync } = require('child_process');

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
  let port = 0;
  for (const arg of args) {
    if (arg.startsWith('--mode=')) mode = arg.split('=')[1];
    else if (arg.startsWith('--port=')) {
      const rawPort = arg.split('=')[1];
      port = rawPort === '0' ? 0 : (parseInt(rawPort, 10) || 0);
    }
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
    
    let scanRoots = [path.join(root, 'src')];
    try {
      const localCfgPath = path.join(root, '.mbo/config.json');
      if (fs.existsSync(localCfgPath)) {
        const localCfg = JSON.parse(fs.readFileSync(localCfgPath, 'utf8'));
        if (Array.isArray(localCfg.scanRoots) && localCfg.scanRoots.length > 0) {
          scanRoots = localCfg.scanRoots.map(r => path.resolve(root, r));
        }
      }
    } catch (_) {}
    this.scanRoots = scanRoots;

    this.scanner = new StaticScanner(this.graphStore, {
      instanceType: mode,
      scanRoots: this.scanRoots
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

  // BUG-174: async to avoid blocking the event loop with synchronous fs calls over up to 5000 files.
  async _computeScanInputSignal(maxFiles = 5000) {
    const specPath = path.join(this.root, '.dev/spec/SPEC.md');
    let latestInputMtimeMs = 0;
    let scannedFiles = 0;
    let truncated = false;

    const statMtime = async (targetPath) => {
      try {
        return (await fs.promises.stat(targetPath)).mtimeMs || 0;
      } catch (_) {
        return 0;
      }
    };

    const stack = [...this.scanRoots];
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);
    while (stack.length > 0) {
      const dirPath = stack.pop();
      let entries = [];
      try {
        const stat = await fs.promises.stat(dirPath);
        if (!stat.isDirectory()) {
          scannedFiles += 1;
          const m = stat.mtimeMs || 0;
          if (m > latestInputMtimeMs) latestInputMtimeMs = m;
          continue;
        }
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
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

        const mtime = await statMtime(path.join(dirPath, entry.name));
        if (mtime > latestInputMtimeMs) latestInputMtimeMs = mtime;
      }

      if (truncated) break;
    }

    const specMtimeMs = await statMtime(specPath);
    if (specMtimeMs > latestInputMtimeMs) {
      latestInputMtimeMs = specMtimeMs;
    }

    return {
      latest_input_mtime_ms: Math.floor(latestInputMtimeMs),
      scanned_files_for_signal: scannedFiles,
      signal_truncated: truncated,
    };
  }

  async _summarizeAndPersistScan(diagnostics, trigger) {
    const failedFiles = diagnostics.failedFiles || [];
    // BUG-072: Enrich failures are best-effort warnings, not critical failures.
    // failed_critical is reserved for static scan failures only.
    const criticalFailures = failedFiles.filter((f) => f.path !== '<enrich>').length;
    const status = criticalFailures > 0
      ? 'failed_critical'
      : (failedFiles.length > 0 ? 'completed_with_warnings' : 'completed');
    const inputSignal = await this._computeScanInputSignal();

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
    // BUG-172: detach the queue tail from the rejection so one write failure does not
    // permanently block all future operations. The caller still receives the rejecting promise.
    const next = this._writeQueue.then(fn);
    this._writeQueue = next.catch((err) => {
      console.error(`[GraphService] ${new Date().toISOString()} Write queue error: ${err.message}`);
    });
    return next;
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
          name: 'graph_rescan_changed',
          description: 'Incremental rescan: detects files changed since the last git commit (git diff --name-only HEAD) and re-scans only those files. Much faster than a full rescan for small changesets. Falls back to full rescan if git is unavailable.',
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
          name: 'graph_metadata_sniff',
          description: 'Lightweight per-file classification and complexity triage from existing graph nodes. Read-only — does not trigger a scan.',
          inputSchema: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' },
                description: 'Relative file paths to sniff.',
              },
            },
            required: ['files'],
          },
        },
        {
          name: 'graph_get_knowledge_pack',
          description: 'Assemble a task-scoped context bundle: anchor nodes for the given files, 1-hop dependency nodes, and spec sections matching the pattern. Read-only — does not trigger a scan.',
          inputSchema: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: { type: 'string' },
                description: 'Relative file paths — task anchors.',
              },
              pattern: {
                type: 'string',
                description: 'Free-text search term for spec section matching.',
              },
              max_nodes: {
                type: 'number',
                description: 'Maximum nodes in pack. Default 40, hard cap 80.',
              },
            },
            required: ['files', 'pattern'],
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
            // BUG-129: background enrichment
            this.scanner.enrich(this.root).catch(e => {
              console.error(`[GraphService] Background enrichment failed: ${e.message}`);
            });
            // Increment only after successful completion — not if scanDirectory/enrich throws.
            this.indexRevision = this.db.incrementIndexRevision();
            this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
            return { content: [{ type: 'text', text: `Graph updated for ${(args.modifiedFiles || []).length} files.` }] };
          } finally {
            this.isScanning = false;
          }
        });
      }
      case 'graph_rescan_changed': {
        return this.enqueueWrite(async () => {
          this.isScanning = true;
          try {
            console.error(`[GraphService] ${new Date().toISOString()} Starting incremental rescan (git)...`);
            let changedFiles = [];
            try {
              // BUG-171: timeout prevents a hung git process from blocking the event loop indefinitely.
              const diff = execSync('git diff --name-only HEAD', { cwd: this.root, encoding: 'utf8', timeout: 5000 });
              changedFiles = diff.split('\n').filter(Boolean);
            } catch (e) {
              console.error(`[GraphService] Git diff failed, falling back to full rescan: ${e.message}`);
              this.isScanning = false; // Release for full rescan call
              return await this.callTool('graph_rescan', args);
            }

            const diagnostics = { scannedFiles: 0, failedFiles: [] };
            for (const file of changedFiles) {
              const absPath = path.resolve(this.root, file);
              if (fs.existsSync(absPath)) {
                try {
                  await this.scanner.scanFile(absPath, this.root);
                  diagnostics.scannedFiles++;
                } catch (e) {
                  diagnostics.failedFiles.push({ path: file, error: e.message });
                }
              }
            }
            
            // BUG-129: background enrichment
            this.scanner.enrich(this.root).catch(e => {
              console.error(`[GraphService] Background enrichment failed: ${e.message}`);
            });

            this.indexRevision = this.db.incrementIndexRevision();
            this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
            const summary = await this._summarizeAndPersistScan(diagnostics, 'graph_rescan_changed');
            return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
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

            for (const r of this.scanRoots) {
              if (fs.existsSync(r)) {
                const stat = fs.statSync(r);
                if (stat.isDirectory()) {
                  await this.scanner.scanDirectorySafe(r, this.root, diagnostics);
                } else {
                  try {
                    await this.scanner.scanFile(r, this.root);
                    diagnostics.scannedFiles += 1;
                  } catch (e) {
                    diagnostics.failedFiles.push({ path: path.relative(this.root, r), error: e.message });
                  }
                }
              }
            }
            // BUG-129: background enrichment
            this.scanner.enrich(this.root).catch(e => {
              console.error(`[GraphService] Background enrichment failed: ${e.message}`);
            });
            // Increment only after successful completion — not if scanDirectory/enrich throws.
            this.indexRevision = this.db.incrementIndexRevision();
            this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
            console.error(`[GraphService] ${new Date().toISOString()} Rescan complete. index_revision=${this.indexRevision}`);

            const summary = await this._summarizeAndPersistScan(diagnostics, 'manual_rescan');

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
      case 'graph_metadata_sniff': {
        const files = Array.isArray(args.files) ? args.files : [];
        const results = files.map(f => {
          const relPath = f.startsWith('file://') ? f.slice(7) : f;
          const nodeId = `file://${relPath}`;
          const node = this.graphStore.getNode(nodeId);
          if (!node) return { path: relPath, found: false };
          const meta = node.metadata || {};
          const size = meta.size || 0;
          const sizeBucket = size < 1000 ? 'tiny' : size < 5000 ? 'small' : size < 20000 ? 'medium' : 'large';
          const symbolCount = this.db.get(
            'SELECT COUNT(*) as count FROM nodes WHERE path = ? AND type != ?',
            [relPath, 'file']
          )?.count || 0;
          const importCount = this.db.get(
            'SELECT COUNT(*) as count FROM edges WHERE source_id = ? AND relation = ?',
            [nodeId, 'IMPORTS']
          )?.count || 0;
          const complexity = symbolCount > 20 || importCount > 15 ? 3 : symbolCount > 8 || importCount > 6 ? 2 : 1;
          const name = node.name || '';
          const classification =
            /spec|SPEC/.test(relPath)   ? 'spec'   :
            /test|\.test\./.test(name)  ? 'test'   :
            /config|\.json$/.test(name) ? 'config' :
            /util|helper/.test(relPath) ? 'util'   : 'core';
          return {
            path: relPath,
            found: true,
            size_bucket: sizeBucket,
            complexity_tier: complexity,
            import_count: importCount,
            node_count: symbolCount,
            classification,
            stale: Boolean(meta.stale),
            last_modified: meta.last_modified || null,
          };
        });
        return { content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }] };
      }
      case 'graph_get_knowledge_pack': {
        const files = Array.isArray(args.files) ? args.files : [];
        const pattern = String(args.pattern || '');
        const maxNodes = Math.min(Number(args.max_nodes) || 40, 80);
        const pack = this.graphStore.getKnowledgePack(files, pattern, maxNodes);
        return { content: [{ type: 'text', text: JSON.stringify(pack, null, 2) }] };
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
    for (const r of this.scanRoots) {
      console.error(`[GraphService] ${new Date().toISOString()} Scanning ${path.relative(this.root, r) || '.'}...`);
      if (fs.existsSync(r)) {
        const stat = fs.statSync(r);
        if (stat.isDirectory()) await this.scanner.scanDirectory(r, this.root);
        else await this.scanner.scanFile(r, this.root);
      }
    }
    console.error(`[GraphService] ${new Date().toISOString()} Enriching graph (LSP)...`);
    try {
      await this.scanner.enrich(this.root);
    } catch (e) {
      // BUG-072: Enrichment failures are best-effort warnings.
      console.error(`[GraphService] ${new Date().toISOString()} Enrichment warning during initDev: ${e.message}`);
    }
    console.error(`[GraphService] ${new Date().toISOString()} Dev init complete.`);
  }

  async autoRefreshDevIfStale() {
    const epoch = new Date(0).toISOString();
    const specPath = path.join(this.root, '.dev/spec/SPEC.md');
    let srcMtimeMs = 0;
    let specMtimeMs = 0;
    for (const r of this.scanRoots) {
      try {
        const m = fs.statSync(r).mtimeMs || 0;
        if (m > srcMtimeMs) srcMtimeMs = m;
      } catch (_) {}
    }
    try {
      specMtimeMs = fs.statSync(specPath).mtimeMs || 0;
    } catch (_) {
      specMtimeMs = 0;
    }

    const inputSignal = await this._computeScanInputSignal();

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

        for (const r of this.scanRoots) {
          if (fs.existsSync(r)) {
            const stat = fs.statSync(r);
            if (stat.isDirectory()) {
              await this.scanner.scanDirectorySafe(r, this.root, diagnostics);
            } else {
              try {
                await this.scanner.scanFile(r, this.root);
                diagnostics.scannedFiles += 1;
              } catch (e) {
                diagnostics.failedFiles.push({ path: path.relative(this.root, r), error: e.message });
              }
            }
          }
        }
        try {
          await this.scanner.enrich(this.root);
        } catch (e) {
          diagnostics.failedFiles.push({ path: '<enrich>', error: e.message });
        }

        this.indexRevision = this.db.incrementIndexRevision();
        this.lastIndexedAt = this.db.getServerMeta('last_indexed_at');
        const summary = await this._summarizeAndPersistScan(diagnostics, 'dev_auto_refresh');
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
  const PORT = Number.isFinite(port) ? port : 0;

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
    const actualPort = httpServer.address().port;
    const manifestDir = mode === 'dev' ? path.join(root, '.dev/run') : path.join(root, '.mbo/run');
    const pidManifest = path.join(manifestDir, `mcp-${graphService.projectId}-${process.pid}.json`);
    const symlinkPath = path.join(manifestDir, 'mcp.json');

    try {
      fs.mkdirSync(manifestDir, { recursive: true });
      const manifestData = JSON.stringify({
        project_root: root,
        project_id: graphService.projectId,
        port: actualPort,
        pid: process.pid,
        status: 'ready',
        timestamp: new Date().toISOString()
      }, null, 2);

      // Atomic write: tmp -> rename
      const tmpPath = `${pidManifest}.tmp`;
      fs.writeFileSync(tmpPath, manifestData);
      fs.renameSync(tmpPath, pidManifest);

      // Atomic symlink: tmp symlink -> rename
      const tmpSymlink = `${symlinkPath}.tmp`;
      try { if (fs.existsSync(tmpSymlink)) fs.unlinkSync(tmpSymlink); } catch (_) {}
      // BUG-165: Remove dangling symlink if target file is gone (prior crashed instance).
      // existsSync follows symlinks (returns false for dangling); lstatSync does not.
      try { if (!fs.existsSync(symlinkPath)) fs.lstatSync(symlinkPath) && fs.unlinkSync(symlinkPath); } catch (_) {}
      fs.symlinkSync(path.basename(pidManifest), tmpSymlink);
      fs.renameSync(tmpSymlink, symlinkPath);
    } catch (err) {
      console.error(`[MCP] Failed to write manifest to ${manifestDir}: ${err.message}`);
    }

    // BUG-078: refresh all registered agent client configs with the live port.
    // Runs on every daemon startup so launchd respawns self-heal without manual intervention.
    try {
      const { updateClientConfigs } = require('../utils/update-client-configs');
      updateClientConfigs(root, actualPort, {
        log: (msg) => console.error(`[MCP] ${new Date().toISOString()} ${msg}`)
      });
    } catch (err) {
      console.error(`[MCP] ${new Date().toISOString()} [WARN] updateClientConfigs failed: ${err.message}`);
    }

    console.error(`[MCP] ${new Date().toISOString()} Graph MCP Server (${mode}) listening on http://127.0.0.1:${actualPort}/mcp`);
    if (mode === 'dev') {
      graphService.autoRefreshDevIfStale()
        .catch((err) => {
          console.error(`[MCP] ${new Date().toISOString()} Dev auto-refresh failed:`, err.message);
        });
    }

    // Max-uptime self-termination: exit after 12h so launchd respawns a fresh instance.
    // Only fires when launchd is the parent (ppid === 1) — manual/mbo-mcp launches are unaffected.
    // Defers if a scan is in progress or active sessions exist; retries every 60s until clear.
    const MAX_UPTIME_MS = 12 * 60 * 60 * 1000;
    const scheduleUptimeExit = () => {
      const timer = setTimeout(() => {
        if (process.ppid !== 1) {
          console.error(`[MCP] ${new Date().toISOString()} Max-uptime timer fired but not under launchd (ppid=${process.ppid}) — skipping self-exit.`);
          return;
        }
        if (graphService.isScanning || sessions.size > 0) {
          console.error(`[MCP] ${new Date().toISOString()} Max-uptime defer — isScanning=${graphService.isScanning} sessions=${sessions.size} — retrying in 60s`);
          setTimeout(scheduleUptimeExit, 60_000).unref();
          return;
        }
        console.error(`[MCP] ${new Date().toISOString()} Max uptime (12h) reached — self-terminating for launchd respawn`);
        shutdown('max_uptime_12h');
      }, MAX_UPTIME_MS);
      timer.unref();
    };
    scheduleUptimeExit();
  });

  const shutdown = async (reason = null) => {
    console.error(`[MCP] ${new Date().toISOString()} Shutting down graph server...`);
    const manifestDir = mode === 'dev' ? path.join(root, '.dev/run') : path.join(root, '.mbo/run');
    const pidManifest = path.join(manifestDir, `mcp-${graphService.projectId}-${process.pid}.json`);
    const symlinkPath = path.join(manifestDir, 'mcp.json');

    try {
      if (fs.existsSync(pidManifest)) fs.unlinkSync(pidManifest);
      try {
        if (fs.existsSync(symlinkPath)) {
          const target = fs.readlinkSync(symlinkPath);
          if (target === path.basename(pidManifest)) {
            fs.unlinkSync(symlinkPath);
          }
        }
      } catch (_) {}
    } catch (_) {}

    for (const transport of sessions.values()) {
      try { await transport.close(); } catch (_) {}
    }
    await graphService.shutdown();
    // BUG-173: force-close keep-alive connections so httpServer.close() resolves within
    // launchd's 5s exit timeout. Without this, SIGKILL fires before shutdown() completes —
    // WAL checkpoint skipped, PID manifest left dangling (root cause of BUG-165 persistence).
    httpServer.closeAllConnections();
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
