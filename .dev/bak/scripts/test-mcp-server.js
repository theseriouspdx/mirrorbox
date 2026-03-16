const { spawn } = require('child_process');
const path = require('path');

async function testMCP() {
  console.log('Starting Graph MCP Server test...');
  
  const serverPath = path.join(__dirname, '../src/graph/mcp-server.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  let messageId = 1;

  function sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: messageId++,
      method,
      params
    };
    server.stdin.write(JSON.stringify(request) + '\n');
  }

  server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        console.log('Response:', JSON.stringify(response, null, 2));
        
        if (response.id === 1) {
          // Handshake complete, list tools
          sendRequest('tools/list');
        } else if (response.result && response.result.tools) {
          console.log('Tools found:', response.result.tools.map(t => t.name));
          // Call a search tool as a smoke test
          sendRequest('tools/call', {
            name: 'graph_search',
            arguments: { pattern: 'GraphStore' }
          });
        } else if (response.id === 3) {
           console.log('Test complete. Closing server.');
           server.kill();
           process.exit(0);
        }
      } catch (e) {
        // Ignore non-json output
      }
    }
  });

  // 1. Initialize Handshake
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });

  setTimeout(() => {
    console.error('Test timed out');
    server.kill();
    process.exit(1);
  }, 5000);
}

testMCP().catch(console.error);
