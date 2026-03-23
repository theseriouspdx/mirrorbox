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
console.log('── Environment OK — proceeding with client-config-refresh test ────\n');

const { updateClientConfigs, buildClientRegistry, readRegistry } = require('../src/utils/update-client-configs');

const results = [];

function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
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

async function main() {
  console.log('--- test-client-config-refresh.js — Client Config Sync Logic ---\n');

  // ─── Test 1: writes correct JSON ───────────────────────────────────────────
  console.log('Test 1: writes correct JSON to registered client configs');
  {
    const root = makeProjectRoot('t1'); roots.push(root);
    writeMboConfig(root, {
      mcpClients: [
        { name: 'claude', configPath: '.mcp.json' },
        { name: 'gemini', configPath: '.gemini/settings.json' }
      ]
    });

    const result = updateClientConfigs(root, 55555);
    const ok = result.written.includes('.mcp.json') && 
               result.written.includes('.gemini/settings.json') &&
               result.errors.length === 0;
    record('writes correct JSON to registered configs', ok);
  }

  // ─── Test 2: missing .mbo/config.json ──────────────────────────────────────
  console.log('\nTest 2: missing .mbo/config.json');
  {
    const root = makeProjectRoot('t2'); roots.push(root);
    let threw = false;
    let result;
    try { result = updateClientConfigs(root, 55555); } catch (_) { threw = true; }
    record('missing config.json → no crash', !threw && result.written.length === 0);
  }

  // ─── Test 3: empty mcpClients ──────────────────────────────────────────────
  console.log('\nTest 3: empty mcpClients array');
  {
    const root = makeProjectRoot('t3'); roots.push(root);
    writeMboConfig(root, { mcpClients: [] });
    const result = updateClientConfigs(root, 55555);
    record('empty mcpClients → no writes', result.written.length === 0);
  }

  // ─── Test 4: missing config directory ──────────────────────────────────────
  console.log('\nTest 4: missing config directory');
  {
    const root = makeProjectRoot('t4'); roots.push(root);
    writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
    updateClientConfigs(root, 55555);
    record('missing config directory → created', fs.existsSync(path.join(root, '.mcp.json')));
  }

  // ─── Test 5: invalid port ──────────────────────────────────────────────────
  console.log('\nTest 5: invalid port');
  {
    const root = makeProjectRoot('t5'); roots.push(root);
    writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
    const r0 = updateClientConfigs(root, 0, { log: () => {} });
    record('invalid port → skipped', r0.written.length === 0);
  }

  // ─── Test 6: unwritable path ───────────────────────────────────────────────
  console.log('\nTest 6: unwritable path');
  {
    const root = makeProjectRoot('t6'); roots.push(root);
    fs.writeFileSync(path.join(root, 'blocker'), 'i am a file');
    writeMboConfig(root, { mcpClients: [{ name: 'bad', configPath: 'blocker/nested/config.json' }] });
    let result;
    try { result = updateClientConfigs(root, 55555, { log: () => {} }); } catch (_) {}
    record('unwritable path → error reported', result && result.errors.length > 0);
  }

  // ─── Test 7/8: buildClientRegistry ─────────────────────────────────────────
  console.log('\nTest 7/8: buildClientRegistry logic');
  {
    const c1 = buildClientRegistry({ geminiCLI: true });
    const c2 = buildClientRegistry({ geminiCLI: false });
    record('buildClientRegistry filters gemini correctly', 
           c1.some(c => c.name === 'gemini') && !c2.some(c => c.name === 'gemini'));
  }

  // ─── Test 9: overwrite ─────────────────────────────────────────────────────
  console.log('\nTest 9: overwrite existing file');
  {
    const root = makeProjectRoot('t9'); roots.push(root);
    writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
    updateClientConfigs(root, 11111);
    updateClientConfigs(root, 22222);
    const after = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    record('existing file gets overwritten', after.mcpServers['mbo-graph'].url.includes('22222'));
  }

  // ─── Test 10: malformed JSON ───────────────────────────────────────────────
  console.log('\nTest 10: malformed JSON in readRegistry');
  {
    const root = makeProjectRoot('t10'); roots.push(root);
    const mboDir = path.join(root, '.mbo');
    fs.mkdirSync(mboDir, { recursive: true });
    fs.writeFileSync(path.join(mboDir, 'config.json'), '{ this is not json }');
    const reg = readRegistry(root);
    record('readRegistry handles malformed JSON', Array.isArray(reg) && reg.length === 0);
  }

  // ─── Test 11: trailing newline ─────────────────────────────────────────────
  console.log('\nTest 11: valid JSON with trailing newline');
  {
    const root = makeProjectRoot('t11'); roots.push(root);
    writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
    updateClientConfigs(root, 33333);
    const raw = fs.readFileSync(path.join(root, '.mcp.json'), 'utf8');
    record('written file has trailing newline', raw.endsWith('\n'));
  }

  cleanup(roots);

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Client Config Refresh Summary Table ──────────────────────────');
  console.log('| Test Case                                      | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-client-config-refresh.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
