const http = require('http');

async function callMCP(method, params = {}, sessionId = null) {
  const port = 3737; // Server port
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params
  });

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Content-Length': Buffer.byteLength(body)
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/mcp',
      method: 'POST',
      headers
    }, (res) => {
      let responseBody = '';
      const sid = res.headers['mcp-session-id'];
      res.on('data', (chunk) => { responseBody += chunk.toString(); });
      res.on('end', () => {
        try {
          if (responseBody.includes('data:')) {
             const lines = responseBody.split('\n');
             for (const line of lines) {
               if (line.startsWith('data:')) {
                 const data = line.slice(5).trim();
                 if (data && data !== '[DONE]') {
                   const json = JSON.parse(data);
                   resolve({ result: json.result, sessionId: sid, raw: responseBody });
                   return;
                 }
               }
             }
          }
          const json = JSON.parse(responseBody);
          resolve({ result: json.result, sessionId: sid, raw: responseBody });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseBody}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const [,, command, ...args] = process.argv;

(async () => {
  try {
    const init = await callMCP('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-query-script', version: '1.0.0' }
    });
    const sid = init.sessionId;

    let res;
    if (command === 'graph_server_info') {
      res = await callMCP('tools/call', { name: 'graph_server_info', arguments: {} }, sid);
    } else if (command === 'graph_search') {
      res = await callMCP('tools/call', { name: 'graph_search', arguments: { pattern: args[0] } }, sid);
    } else if (command === 'graph_rescan') {
      res = await callMCP('tools/call', { name: 'graph_rescan', arguments: {} }, sid);
    } else if (command === 'tools_list') {
      res = await callMCP('tools/list', {}, sid);
    } else {
      console.log("Usage: node mcp_query.js [graph_server_info | graph_search <pattern> | graph_rescan | tools_list]");
      return;
    }
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e.message);
  }
})();
