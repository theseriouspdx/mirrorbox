const http = require('http');
const fs = require('fs');
const path = require('path');

async function testMCP() {
  console.log('--- Testing Graph MCP Server (HTTP) ---');

  const PROJECT_ROOT = path.resolve(__dirname, '..');
  const manifestPath = path.join(PROJECT_ROOT, '.dev/run/mcp.json');

  if (!fs.existsSync(manifestPath)) {
    console.log('SKIP: MCP manifest not found. Run mbo setup first.');
    return;
  }

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
    console.log('Tools found:', toolNames);

    // 3. Call search smoke test
    console.log('Step 3: Smoke test (graph_search)...');
    const search = await sendRequest('tools/call', {
      name: 'graph_search',
      arguments: { pattern: 'GraphStore' }
    }, sid);
    if (!search.msg.result || !search.msg.result.content) throw new Error('graph_search failed to return content');
    console.log('Search result found:', true);

    console.log('PASS: MCP Server HTTP smoke test successful.');
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }
}

testMCP().catch(console.error);
