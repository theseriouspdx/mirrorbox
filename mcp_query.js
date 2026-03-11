const http = require('http');

async function mcpQuery(method, params, sessionId = null) {
  const options = {
    hostname: '127.0.0.1',
    port: 3737,
    path: '/mcp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    }
  };

  if (sessionId) {
    options.headers['mcp-session-id'] = sessionId;
  }

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const events = data.split('\n\n').filter(e => e.trim());
          let response = null;
          for (const event of events) {
            const dataLine = event.split('\n').find(l => l.startsWith('data:'));
            if (dataLine) {
              response = JSON.parse(dataLine.slice(5).trim());
              break;
            }
          }
          if (!response) throw new Error('No data event found');
          resolve({ response, sessionId: res.headers['mcp-session-id'] });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (err) => { reject(err); });
    req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }));
    req.end();
  });
}

async function main() {
  const query = process.argv[2] || 'Implement Cross-World Event Streaming';

  try {
    const { response: initRes, sessionId } = await mcpQuery('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mbo-query-tool', version: '1.0.0' }
    });

    if (initRes.error) {
      console.error('Initialization Error:', initRes.error);
      process.exit(1);
    }

    const { response: toolRes } = await mcpQuery('tools/call', {
      name: 'graph_search',
      arguments: { pattern: query }
    }, sessionId);

    console.log(JSON.stringify(toolRes.result, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
