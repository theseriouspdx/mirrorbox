#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 12000;
const INIT_TIMEOUT_STEPS = [6000, 12000, 25000, 45000];

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

function hashProjectId(projectRoot) {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(projectRoot, 'utf8'))
    .digest('hex')
    .slice(0, 16);
}

function resolveCandidates() {
  const cwdRoot = canonicalPath(process.cwd());
  const candidates = [];
  const diagnostics = [];

  candidates.push({
    endpoint: { host: '127.0.0.1', port: 7337, path: '/mcp' },
    source: 'fixed-port',
    score: 1000,
    matchedRoot: true,
    matchedProjectId: true,
    isEnvOverride: false,
  });

  return { candidates, diagnostics, cwdRoot, expectedProjectId: hashProjectId(cwdRoot) };
}

async function callMCP(endpoint, method, params = {}, sessionId = null, timeoutMs = DEFAULT_TIMEOUT_MS) {
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
      host: endpoint.host,
      port: endpoint.port,
      path: endpoint.path,
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
      res.on('error', (err) => finish(reject, err));
      res.on('end', () => {
        if (settled) return;
        if (res.statusCode && res.statusCode >= 400) {
          finish(reject, new Error(`MCP HTTP ${res.statusCode}: ${responseBody || 'no response body'}`));
          return;
        }
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

    req.setTimeout(timeoutMs, () => {
      finish(reject, new Error(`MCP request timeout for method=${method}`));
      req.destroy();
    });
    req.on('error', (err) => finish(reject, err));
    req.write(body);
    req.end();
  });
}

function isRetryableError(err) {
  const msg = String(err && err.message ? err.message : err || '');
  return (
    msg.includes('timeout') ||
    msg.includes('INDEXING_IN_PROGRESS') ||
    msg.includes('MCP HTTP 503') ||
    msg.includes('ECONNRESET') ||
    msg.includes('socket hang up') ||
    msg.includes('EPIPE')
  );
}

function tcpProbe(endpoint, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint.port, endpoint.host);
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.destroy();
      finish(resolve, true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      finish(reject, new Error(`TCP probe timeout ${endpoint.host}:${endpoint.port}`));
    });
    socket.on('error', (err) => finish(reject, err));
  });
}

function postProbe(endpoint, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const body = JSON.stringify({ probe: true });
    const req = http.request({
      host: endpoint.host,
      port: endpoint.port,
      path: endpoint.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      // Any timely HTTP response proves the endpoint can read/process POST,
      // even if payload is intentionally invalid.
      res.resume();
      finish(resolve, true);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish(reject, new Error(`POST probe timeout ${endpoint.host}:${endpoint.port}`));
    });
    req.on('error', (err) => finish(reject, err));
    req.write(body);
    req.end();
  });
}

function parseInvocation(argv) {
  const args = argv.filter((a) => a !== '--diagnose');
  const diagnose = argv.length !== args.length;
  const raw = args[0];
  if (!raw) return { diagnose, op: null, arg: null };

  const fnMatch = raw.match(/^([a-z_]+)\((.*)\)$/i);
  if (fnMatch) {
    const fn = fnMatch[1];
    const inner = fnMatch[2].trim();
    if (fn === 'graph_search') {
      const qMatch = inner.match(/^['\"]([\s\S]*)['\"]$/);
      return { diagnose, op: fn, arg: qMatch ? qMatch[1] : inner };
    }
    return { diagnose, op: fn, arg: null };
  }

  return { diagnose, op: raw, arg: args[1] || null };
}

async function initializeWithFallback(candidates, diagnose = false) {
  const errors = [];

  for (const candidate of candidates) {
    const endpointTag = `${candidate.endpoint.host}:${candidate.endpoint.port}`;
    if (diagnose) {
      console.error(
        `[MCP QUERY] Trying ${endpointTag} (source=${candidate.source}, score=${candidate.score}, ` +
        `root_match=${candidate.matchedRoot}, id_match=${candidate.matchedProjectId})`
      );
    }

    try {
      await tcpProbe(candidate.endpoint);
    } catch (err) {
      errors.push(`${endpointTag} probe failed: ${err.message}`);
      continue;
    }

    try {
      await postProbe(candidate.endpoint);
    } catch (err) {
      // Advisory-only: a busy server can timeout probe during startup/refresh.
      // Keep going and let initialize timeouts be the authoritative health check.
      errors.push(`${endpointTag} POST probe warning: ${err.message}`);
    }

    let initErr = null;
    for (const timeoutMs of INIT_TIMEOUT_STEPS) {
      try {
        const init = await callMCP(candidate.endpoint, 'initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-query-script', version: '1.1.0' }
        }, null, timeoutMs);

        if (init && init.error) {
          const message = String(init.error.message || JSON.stringify(init.error));
          if (message.includes('Server already initialized') && init.sessionId) {
            return { endpoint: candidate.endpoint, sessionId: init.sessionId };
          }
          throw new Error(message);
        }

        return { endpoint: candidate.endpoint, sessionId: init.sessionId };
      } catch (err) {
        initErr = err;
        if (!isRetryableError(err)) break;
      }
    }

    errors.push(`${endpointTag} initialize failed: ${initErr ? initErr.message : 'unknown error'}`);
  }

  throw new Error(errors.join('\n'));
}

const { diagnose, op, arg } = parseInvocation(process.argv.slice(2));

(async () => {
  try {
    const { candidates, diagnostics, cwdRoot, expectedProjectId } = resolveCandidates();
    if (diagnose && diagnostics.length > 0) {
      for (const d of diagnostics) {
        console.error(`[MCP QUERY] ${d}`);
      }
      console.error(`[MCP QUERY] cwd=${cwdRoot} expected_project_id=${expectedProjectId}`);
    }
    if (candidates.length === 0) throw new Error('No MCP endpoint candidates available.');

    const session = await initializeWithFallback(candidates, diagnose);
    const sid = session.sessionId;

    let res;
    if (op === 'graph_server_info') {
      res = await callMCP(session.endpoint, 'tools/call', { name: 'graph_server_info', arguments: {} }, sid);
    } else if (op === 'graph_search') {
      res = await callMCP(session.endpoint, 'tools/call', { name: 'graph_search', arguments: { pattern: arg } }, sid);
    } else if (op === 'graph_rescan') {
      res = await callMCP(session.endpoint, 'tools/call', { name: 'graph_rescan', arguments: {} }, sid);
    } else if (op === 'tools_list') {
      res = await callMCP(session.endpoint, 'tools/list', {}, sid);
    } else {
      console.log('Usage: node ./mcp_query.js [--diagnose] [graph_server_info | graph_search <pattern> | graph_rescan | tools_list]');
      console.log('Also supports function style: node ./mcp_query.js "graph_search(\'pattern\')"');
      return;
    }
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e.message);
  }
})();
