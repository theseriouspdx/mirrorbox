const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const runDir = path.join(ROOT, '.dev', 'run');
const manifestPath = path.join(runDir, 'mcp.json');
const serverPath = path.join(ROOT, 'src', 'graph', 'mcp-server.js');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function canonicalizeJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalizeJSON(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJSON(value[k])}`).join(',')}}`;
}

function checksumOf(manifest) {
  const { createHash } = require('crypto');
  const { checksum, ...withoutChecksum } = manifest;
  return createHash('sha256').update(Buffer.from(canonicalizeJSON(withoutChecksum), 'utf8')).digest('hex');
}

function mcpPost(port, payload, sid = null) {
  return new Promise((resolve, reject) => {
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
        } catch (e) {
          reject(new Error(`parse_error: ${text}`));
        }
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
          protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mcp-contract-v3-test', version: '1.0.0' }
        }
      });
      if (init && init.sid) return init.sid;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('server_not_healthy');
}

async function startServer(port) {
  const proc = spawn('node', [serverPath, '--mode=dev', `--root=${ROOT}`], {
    env: { ...process.env, MBO_PORT: String(port) },
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

(async () => {
  const failures = [];
  const portA = 62101;
  const portB = 62102;

  let a = null;
  let b = null;

  try {
    a = await startServer(portA);
    await sleep(400);
    const m1 = readManifest();

    if (m1.manifest_version !== 3) failures.push('manifest_version != 3');
    if (m1.status !== 'ready') failures.push(`status != ready (got ${m1.status})`);
    if (m1.checksum !== checksumOf(m1)) failures.push('checksum validation failed');
    if (!m1.instance_id) failures.push('instance_id missing');

    await stopServer(a.proc);

    b = await startServer(portB);
    await sleep(400);
    const m2 = readManifest();
    if (!(Number(m2.epoch) > Number(m1.epoch))) failures.push('epoch did not increment');
    if (m2.instance_id === m1.instance_id) failures.push('instance_id did not change');

    await stopServer(b.proc);

    fs.writeFileSync(manifestPath, '{"manifest_version":3,"checksum":"broken"', 'utf8');
    b = await startServer(portB + 1);
    await sleep(400);
    const m3 = readManifest();
    if (m3.status !== 'ready') failures.push(`corrupt recovery status != ready (got ${m3.status})`);
    if (m3.checksum !== checksumOf(m3)) failures.push('corrupt recovery checksum invalid');

    await stopServer(b.proc);
  } catch (e) {
    failures.push(`harness_error: ${e.message}`);
    if (a) await stopServer(a.proc);
    if (b) await stopServer(b.proc);
  }

  if (failures.length > 0) {
    console.error('FAILURES');
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }

  console.log('PASS mcp-contract-v3');
})();
