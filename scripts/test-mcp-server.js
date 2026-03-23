'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const manifestPath = path.join(PROJECT_ROOT, '.dev/run/mcp.json');

// ── Rule 1: Environment Assertions ───────────────────────────────────────────
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'MCP Manifest exists', ok: fs.existsSync(manifestPath), detail: `not found at ${manifestPath}. Run mbo setup first.` }
];
let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
console.log('── Environment OK — proceeding with MCP server test ──────────────\n');

async function testMCP() {
  console.log('--- Testing Graph MCP Server (HTTP) ---');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const port = manifest.port;
  console.log(`Using live MCP server on port ${port}...`);

  function sendRequest(method, params = {}, sid = null) {
    return new Promise((resolve, reject) => {
      const payload = { jsonrpc: '2.0', id: Date.now(), method, params };
      const body = JSON.stringify(payload);
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(body),
          ...(sid ? { 'mcp-session-id': sid } : {})
        },
        timeout: 10000
      }, (res) => {
        let text = '';
        res.on('data', d => text += d);
        res.on('end', () => {
          const sidHeader = Array.isArray(res.headers['mcp-session-id']) ? res.headers['mcp-session-id'][0] : res.headers['mcp-session-id'];
          try {
            // Split by lines to handle SSE framing correctly
            const lines = text.split(/\r?\n/);
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = JSON.parse(line.slice(5).trim());
              // Skip heartbeat/connected events, look for JSON-RPC result/error
              if (data.jsonrpc || data.result || data.error) {
                return resolve({ msg: data, sid: sidHeader });
              }
            }
            // Fallback for non-SSE JSON response
            resolve({ msg: JSON.parse(text), sid: sidHeader });
          } catch (e) { reject(new Error(`Parse error: ${text}`)); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      req.write(body);
      req.end();
    });
  }

  try {
    // 1. Initialize
    console.log('Step 1: Initializing...');
    const init = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    const sid = init.sid;
    if (!sid) throw new Error('Failed to capture session ID from header');
    console.log(`Session ID: ${sid}`);

    // 2. List Tools
    console.log('Step 2: Listing tools...');
    const tools = await sendRequest('tools/list', {}, sid);
    if (!tools.msg.result || !tools.msg.result.tools) throw new Error(`Invalid tools/list response: ${JSON.stringify(tools.msg)}`);
    const toolNames = tools.msg.result.tools.map(t => t.name);

    // ── Rule 5: Live Output Table ──────────────────────────────────────────
    console.log('\n── MCP Server Tools Summary ────────────────────────────────────');
    console.log('| Tool Name                                      | Status       |');
    console.log('| ---------------------------------------------- | ------------ |');
    for (const tool of tools.msg.result.tools) {
      console.log(`| ${tool.name.padEnd(46)} | READY        |`);
    }
    console.log('────────────────────────────────────────────────────────────────\n');

    // 3. Call search smoke test
    console.log('Step 3: Smoke test (graph_search)...');
    const search = await sendRequest('tools/call', {
      name: 'graph_search',
      arguments: { pattern: 'GraphStore' }
    }, sid);
    if (!search.msg.result || !search.msg.result.content) throw new Error('graph_search failed to return content');
    console.log('Search result found:', true);

    console.log('\nPASS: MCP Server HTTP smoke test successful.');
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }
}

testMCP().catch(console.error);
