const { spawn } = require('child_process');
const path = require('path');

async function callMCP(requests) {
  const serverPath = path.join(__dirname, 'src/graph/mcp-server.js');
  const server = spawn('node', [serverPath, '--mode=dev'], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  let messageId = 1;
  const results = [];
  const pendingRequests = [...requests];

  function sendNextRequest() {
    if (pendingRequests.length === 0) return;
    const req = pendingRequests.shift();
    const jsonRpc = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/call',
      params: req
    };
    server.stdin.write(JSON.stringify(jsonRpc) + '\n');
  }

  return new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === 'init') {
              sendNextRequest();
          } else if (response.id > 0) {
            results.push(response.result);
            if (pendingRequests.length === 0) {
              server.kill();
              resolve(results);
            } else {
              sendNextRequest();
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    });

    // 1. Initialize Handshake
    const initReq = {
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mbo-investigator', version: '1.0.0' }
      }
    };
    server.stdin.write(JSON.stringify(initReq) + '\n');

    setTimeout(() => {
      server.kill();
      reject(new Error('Timeout'));
    }, 15000);
  });
}

const main = async () => {
  const requests = [
    {
      name: 'graph_search',
      arguments: { pattern: 'Operator' }
    }
  ];

  try {
    const results = await callMCP(requests);
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

main();
