#!/usr/bin/env node
/**
 * graph_call.js — thin MBO graph-server client
 * Usage: node scripts/graph_call.js <tool> [jsonArgs]
 *
 * Tools: graph_search, graph_query_impact, graph_query_callers,
 *        graph_query_dependencies, graph_query_coverage,
 *        graph_get_knowledge_pack, graph_metadata_sniff,
 *        graph_rescan, graph_rescan_changed, graph_update_task,
 *        graph_ingest_runtime_trace, get_token_usage, graph_server_info
 *
 * Examples:
 *   node scripts/graph_call.js graph_server_info
 *   node scripts/graph_call.js graph_search '{"pattern":"getCostRollup"}'
 *   node scripts/graph_call.js graph_get_knowledge_pack '{"files":["src/state/db-manager.js"],"pattern":"counterfactual"}'
 */
const http = require('http');
const MCP_HOST = '127.0.0.1';
const MCP_PORT = 53935;
const MCP_PATH = '/mcp';

const tool = process.argv[2];
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};

if (!tool) {
  console.error('Usage: node scripts/graph_call.js <tool> [jsonArgs]');
  process.exit(1);
}

let sessionId = null;

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(data),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const req = http.request(
      { host: MCP_HOST, port: MCP_PORT, path: MCP_PATH, method: 'POST', headers },
      res => {
        sessionId = res.headers['mcp-session-id'] || sessionId;
        let buf = '';
        res.on('data', d => (buf += d));
        res.on('end', () => {
          // SSE envelope: strip "event: message\ndata: " wrapper
          const match = buf.match(/^event: message\ndata: (.+)/s);
          try { resolve(JSON.parse(match ? match[1] : buf)); }
          catch { resolve(buf); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const init = await post({
      jsonrpc: '2.0', method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'graph_call', version: '1.0' } },
      id: 1,
    });
    if (init.error) { console.error('Init error:', init.error.message); process.exit(1); }

    // fire-and-forget initialized notification
    post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }).catch(() => {});

    const result = await post({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args }, id: 2 });
    if (result.error) { console.error('Tool error:', result.error.message); process.exit(1); }

    const content = result.result?.content;
    if (Array.isArray(content)) {
      content.forEach(c => { if (c.type === 'text') console.log(c.text); });
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  } catch (err) {
    console.error('Connection error:', err.message);
    console.error('Is the graph server running? Try: mbo mcp start');
    process.exit(1);
  }
})();
