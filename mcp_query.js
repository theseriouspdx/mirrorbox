#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { resolveManifest } = require('./src/utils/resolve-manifest');

function canonicalPath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function sameFilesystemPath(a, b) {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    // On case-insensitive filesystems, dev+ino identity is the safest equality check.
    if (Number.isFinite(sa.dev) && Number.isFinite(sa.ino) && Number.isFinite(sb.dev) && Number.isFinite(sb.ino)) {
      return sa.dev === sb.dev && sa.ino === sb.ino;
    }
  } catch {
    // Fall through to string-based checks.
  }
  if (a === b) return true;
  // Best-effort fallback for case-insensitive path aliases.
  return a.toLowerCase() === b.toLowerCase();
}

function resolveEndpoint() {
  const cwdRoot = canonicalPath(process.cwd());
  const { manifest } = resolveManifest({ root: cwdRoot });
  const manifestRoot = canonicalPath(manifest.project_root || cwdRoot);
  if (!sameFilesystemPath(manifestRoot, cwdRoot)) {
    throw new Error(
      `[MCP QUERY] project_root mismatch. cwd=${cwdRoot} manifest.project_root=${manifestRoot}. ` +
      'Run from the intended project root and retry.'
    );
  }
  return { host: '127.0.0.1', port: manifest.port, path: '/mcp' };
}

async function callMCP(method, params = {}, sessionId = null) {
  const ep = resolveEndpoint();
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
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const req = http.request({
      host: ep.host,
      port: ep.port,
      path: ep.path,
      method: 'POST',
      headers
    }, (res) => {
      let responseBody = '';
      const sid = res.headers['mcp-session-id'];
      res.on('data', (chunk) => {
        responseBody += chunk.toString();

        // Streamable HTTP may keep SSE responses open; resolve on first valid data frame.
        const events = responseBody.split('\n\n');
        for (const event of events) {
          const line = event.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            if (json && (json.result !== undefined || json.error !== undefined)) {
              finish(resolve, { result: json.result, error: json.error, sessionId: sid, raw: responseBody });
              req.destroy();
              return;
            }
          } catch {
            // Wait for more data.
          }
        }
      });
      res.on('end', () => {
        if (settled) return;
        try {
          if (responseBody.includes('data:')) {
             const lines = responseBody.split('\n');
             for (const line of lines) {
               if (line.startsWith('data:')) {
                 const data = line.slice(5).trim();
                 if (data && data !== '[DONE]') {
                   const json = JSON.parse(data);
                   finish(resolve, { result: json.result, error: json.error, sessionId: sid, raw: responseBody });
                   return;
                 }
               }
             }
          }
          const json = JSON.parse(responseBody);
          finish(resolve, { result: json.result, error: json.error, sessionId: sid, raw: responseBody });
        } catch (e) {
          finish(reject, new Error(`Failed to parse response: ${responseBody}`));
        }
      });
    });

    req.setTimeout(30000, () => {
      finish(reject, new Error(`MCP request timeout for method=${method}`));
      req.destroy();
    });
    req.on('error', (err) => finish(reject, err));
    req.write(body);
    req.end();
  });
}

async function withRetry(fn, retries = 3, delayMs = 500) {
  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : err || '');
      const retryable =
        msg.includes('timeout') ||
        msg.includes('ECONNRESET') ||
        msg.includes('socket hang up') ||
        msg.includes('EPIPE');
      if (!retryable || i === retries - 1) break;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

const [,, command, ...args] = process.argv;

(async () => {
  try {
    const init = await withRetry(() => callMCP('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-query-script', version: '1.0.0' }
    }));
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
      console.log('Usage: node ./mcp_query.js [graph_server_info | graph_search <pattern> | graph_rescan | tools_list]');
      return;
    }
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e.message);
  }
})();
