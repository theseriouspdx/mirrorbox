'use strict';

/**
 * test-client-config-refresh.js
 *
 * Tests for BUG-078 fix: updateClientConfigs + buildClientRegistry
 *
 * Covers:
 *   1. Writes correct JSON to all registered client config paths
 *   2. Missing .mbo/config.json → no crash, returns empty result
 *   3. Empty mcpClients array → no crash, no writes
 *   4. Config path directory doesn't exist → creates it
 *   5. Invalid port → no write, graceful skip
 *   6. Unwritable path → logs warning, reports error, doesn't crash
 *   7. buildClientRegistry returns correct entries based on providers
 *   8. Written JSON is valid and matches expected schema
 *   9. Multiple clients all get written
 *  10. Existing file gets overwritten with new port
 *  11. readRegistry returns [] for malformed JSON
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { updateClientConfigs, buildClientRegistry, readRegistry } = require('../src/utils/update-client-configs');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function makeProjectRoot(name) {
  const dir = path.join(os.tmpdir(), `mbo-test-${name}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMboConfig(projectRoot, cfg) {
  const dir = path.join(projectRoot, '.mbo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 2));
}

function cleanup(dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  }
}

const roots = [];

// ─── Test 1: writes correct JSON to all registered paths ─────────────────────
console.log('\nTest 1: writes correct JSON to registered client configs');
{
  const root = makeProjectRoot('t1'); roots.push(root);
  writeMboConfig(root, {
    mcpClients: [
      { name: 'claude', configPath: '.mcp.json' },
      { name: 'gemini', configPath: '.gemini/settings.json' }
    ]
  });

  const result = updateClientConfigs(root, 55555);

  assert(result.written.includes('.mcp.json'),             'claude .mcp.json written');
  assert(result.written.includes('.gemini/settings.json'), 'gemini .gemini/settings.json written');
  assert(result.errors.length === 0,                       'no errors');

  const claude = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert(claude.mcpServers?.['mbo-graph']?.url === 'http://127.0.0.1:55555/mcp', 'claude URL correct');
  assert(claude.mcpServers?.['mbo-graph']?.type === 'http',                       'claude type is http');

  const gemini = JSON.parse(fs.readFileSync(path.join(root, '.gemini/settings.json'), 'utf8'));
  assert(gemini.mcpServers?.['mbo-graph']?.url === 'http://127.0.0.1:55555/mcp', 'gemini URL correct');
}

// ─── Test 2: missing .mbo/config.json → no crash ─────────────────────────────
console.log('\nTest 2: missing .mbo/config.json → no crash, empty result');
{
  const root = makeProjectRoot('t2'); roots.push(root);

  let threw = false;
  let result;
  try { result = updateClientConfigs(root, 55555); }
  catch (_) { threw = true; }

  assert(!threw,                    'no exception thrown');
  assert(result.written.length === 0, 'nothing written');
  assert(result.errors.length === 0,  'no errors');
}

// ─── Test 3: empty mcpClients → no crash ─────────────────────────────────────
console.log('\nTest 3: empty mcpClients array → no crash, no writes');
{
  const root = makeProjectRoot('t3'); roots.push(root);
  writeMboConfig(root, { mcpClients: [] });

  const result = updateClientConfigs(root, 55555);

  assert(result.written.length === 0, 'nothing written');
  assert(result.errors.length === 0,  'no errors');
}

// ─── Test 4: config path directory doesn't exist → creates it ────────────────
console.log('\nTest 4: missing config directory → created automatically');
{
  const root = makeProjectRoot('t4'); roots.push(root);
  writeMboConfig(root, {
    mcpClients: [{ name: 'claude', configPath: '.mcp.json' }]
  });

  assert(!fs.existsSync(path.join(root, '.mcp.json')), 'file does not exist before');
  updateClientConfigs(root, 55555);
  assert(fs.existsSync(path.join(root, '.mcp.json')), 'file exists after');
}

// ─── Test 5: invalid port → no write, graceful skip ──────────────────────────
console.log('\nTest 5: invalid port → skipped gracefully');
{
  const root = makeProjectRoot('t5'); roots.push(root);
  writeMboConfig(root, {
    mcpClients: [{ name: 'claude', configPath: '.mcp.json' }]
  });

  const logs = [];
  const r0 = updateClientConfigs(root, 0,    { log: (m) => logs.push(m) });
  const rN = updateClientConfigs(root, null,  { log: (m) => logs.push(m) });
  const rS = updateClientConfigs(root, 'abc', { log: (m) => logs.push(m) });

  assert(r0.written.length === 0, 'port 0 → nothing written');
  assert(rN.written.length === 0, 'port null → nothing written');
  assert(rS.written.length === 0, 'port string → nothing written');
  assert(!fs.existsSync(path.join(root, '.mcp.json')), 'file not created for invalid port');
}

// ─── Test 6: unwritable path → error reported, no crash ──────────────────────
console.log('\nTest 6: unwritable path → error reported, no crash');
{
  const root = makeProjectRoot('t6'); roots.push(root);
  // Create a regular FILE named 'blocker' — so mkdirSync('blocker/nested') throws ENOTDIR
  fs.writeFileSync(path.join(root, 'blocker'), 'i am a file');
  writeMboConfig(root, {
    mcpClients: [{ name: 'bad', configPath: 'blocker/nested/config.json' }]
  });

  let threw = false;
  let result;
  try { result = updateClientConfigs(root, 55555, { log: () => {} }); }
  catch (_) { threw = true; }

  assert(!threw,                      'no exception thrown');
  assert(result.errors.length > 0,    'error reported');
  assert(result.written.length === 0, 'nothing written');
}

// ─── Test 7: buildClientRegistry — with gemini detected ──────────────────────
console.log('\nTest 7: buildClientRegistry with gemini CLI detected');
{
  const clients = buildClientRegistry({ geminiCLI: true, claudeCLI: true });

  assert(clients.some(c => c.name === 'claude' && c.configPath === '.mcp.json'),
    'claude entry present');
  assert(clients.some(c => c.name === 'gemini' && c.configPath === '.gemini/settings.json'),
    'gemini entry present when geminiCLI=true');
}

// ─── Test 8: buildClientRegistry — without gemini ────────────────────────────
console.log('\nTest 8: buildClientRegistry without gemini CLI');
{
  const clients = buildClientRegistry({ geminiCLI: false, claudeCLI: false });

  assert(clients.some(c => c.name === 'claude'), 'claude always registered');
  assert(!clients.some(c => c.name === 'gemini'), 'gemini not registered when absent');
}

// ─── Test 9: overwrite existing file with new port ───────────────────────────
console.log('\nTest 9: existing file gets overwritten with new port');
{
  const root = makeProjectRoot('t9'); roots.push(root);
  writeMboConfig(root, {
    mcpClients: [{ name: 'claude', configPath: '.mcp.json' }]
  });

  updateClientConfigs(root, 11111);
  const before = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert(before.mcpServers['mbo-graph'].url.includes('11111'), 'first port written');

  updateClientConfigs(root, 22222);
  const after = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert(after.mcpServers['mbo-graph'].url.includes('22222'), 'second port overwrites first');
  assert(!after.mcpServers['mbo-graph'].url.includes('11111'), 'old port gone');
}

// ─── Test 10: readRegistry handles malformed JSON ────────────────────────────
console.log('\nTest 10: readRegistry handles malformed JSON gracefully');
{
  const root = makeProjectRoot('t10'); roots.push(root);
  const mboDir = path.join(root, '.mbo');
  fs.mkdirSync(mboDir, { recursive: true });
  fs.writeFileSync(path.join(mboDir, 'config.json'), '{ this is not json }');

  let threw = false;
  let reg;
  try { reg = readRegistry(root); } catch (_) { threw = true; }

  assert(!threw,            'no exception on bad JSON');
  assert(Array.isArray(reg), 'returns array');
  assert(reg.length === 0,   'returns empty array');
}

// ─── Test 11: written file is valid JSON ending with newline ─────────────────
console.log('\nTest 11: written file is valid JSON with trailing newline');
{
  const root = makeProjectRoot('t11'); roots.push(root);
  writeMboConfig(root, {
    mcpClients: [{ name: 'claude', configPath: '.mcp.json' }]
  });
  updateClientConfigs(root, 33333);

  const raw = fs.readFileSync(path.join(root, '.mcp.json'), 'utf8');
  assert(raw.endsWith('\n'), 'file ends with newline');

  let parsed, parseOk = true;
  try { parsed = JSON.parse(raw); } catch (_) { parseOk = false; }
  assert(parseOk, 'file is valid JSON');
  assert(parsed.mcpServers['mbo-graph'].type === 'http', 'type field present');
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
cleanup(roots);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✓ All tests passed`);
}
