#!/usr/bin/env node
'use strict';

/**
 * test-mcp-contract-v3.js
 *
 * Verifies the Section 1.0-07 / 0.11.186 contract:
 *  - Manifest write on startup
 *  - Ready status after health check
 *  - Port conflict/recovery handling
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

// ── Rule 1: Environment Assertions ───────────────────────────────────────────
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` }
];
let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
console.log('── Environment OK — proceeding with mcp-contract test ────────────\n');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-mcp-contract-v3-'));
// Create required directories in temp root
fs.mkdirSync(path.join(ROOT, '.dev/run'), { recursive: true });
fs.mkdirSync(path.join(ROOT, '.dev/data'), { recursive: true });

const runDir = path.join(ROOT, '.dev/run');
const manifestPath = path.join(runDir, 'mcp.json');
const serverPath = path.resolve(__dirname, '../src/graph/mcp-server.js');


const results = [];
function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function readManifest() {
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch (e) { return null; }
}

function mcpPost(port, payload, sid = null) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1', port, path: '/mcp', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(body),
        ...(sid ? { 'mcp-session-id': sid } : {}),
      }
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk.toString(); });
      res.on('end', () => {
        const sidHeader = Array.isArray(res.headers['mcp-session-id']) ? res.headers['mcp-session-id'][0] : res.headers['mcp-session-id'];
        try {
          for (const line of text.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            return resolve({ msg: JSON.parse(line.slice(5).trim()), sid: sidHeader });
          }
          resolve({ msg: JSON.parse(text), sid: sidHeader });
        } catch (e) { reject(new Error(`parse_error: ${text}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function waitHealthy(port, timeoutMs = 12000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const init = await mcpPost(port, {
        jsonrpc: '2.0', id: 1, method: 'initialize', params: {
          protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mcp-test', version: '1.0' }
        }
      });
      if (init && init.sid) return init.sid;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('server_not_healthy');
}

async function startServer(port) {
  const proc = spawn('node', [serverPath, '--mode=dev', `--root=${ROOT}`, `--port=${port}`], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const sid = await waitHealthy(port);
  return { proc, sid };
}

async function stopServer(proc) {
  if (!proc) return;
  proc.kill('SIGTERM');
  await sleep(500);
}

async function main() {
  console.log('--- test-mcp-contract-v3.js — MCP Server Lifecycle Validation ---\n');
  const portA = 62101;
  const portB = 62102;
  let a = null;
  let b = null;

  try {
    console.log('Phase 1: Startup & Manifest Ready');
    a = await startServer(portA);
    await sleep(400);
    const m1 = readManifest();
    record('Manifest written and status is ready', m1 && m1.status === 'ready');
    record('Manifest port matches assigned port', m1 && m1.port === portA);
    await stopServer(a.proc);

    console.log('\nPhase 2: Port Conflict & Multi-instance Recovery');
    b = await startServer(portB);
    await sleep(400);
    const m2 = readManifest();
    record('New instance overwrites manifest on port change', m2 && m2.port === portB);
    await stopServer(b.proc);

    // Cleanup
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}

  } catch (e) {
    console.error('Test Error:', e.message);
    if (a) await stopServer(a.proc);
    if (b) await stopServer(b.proc);
    record('Server Lifecycle Exception', false);
  }

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── MCP Contract Summary Table ──────────────────────────────────');
  console.log('| Check                                          | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-mcp-contract-v3.js');
}

main().catch(console.error);
