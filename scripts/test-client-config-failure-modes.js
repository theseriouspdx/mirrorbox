'use strict';

/**
 * test-client-config-failure-modes.js
 *
 * Exhaustive failure mode tests for BUG-078 fix.
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
console.log('── Environment OK — proceeding with client-config-failure-modes test ────\n');

const { updateClientConfigs, buildClientRegistry, readRegistry } = require('../src/utils/update-client-configs');

const results = [];
const roots = [];

function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

function makeRoot(name) {
  const dir = path.join(os.tmpdir(), `mbo-fm-${name}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  roots.push(dir);
  return dir;
}

function writeMboConfig(root, cfg) {
  const d = path.join(root, '.mbo');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(cfg, null, 2));
}

const silent = { log: () => {} };

async function main() {
  console.log('--- test-client-config-failure-modes.js — Edge Cases & Robustness ---\n');

  // FM-01: missing name
  {
    const root = makeRoot('fm01');
    writeMboConfig(root, { mcpClients: [{ configPath: '.mcp.json' }] });
    const result = updateClientConfigs(root, 9001, silent);
    record('FM-01: entry missing name → skipped', result.written.length === 0);
  }

  // FM-02: missing configPath
  {
    const root = makeRoot('fm02');
    writeMboConfig(root, { mcpClients: [{ name: 'claude' }] });
    const result = updateClientConfigs(root, 9001, silent);
    record('FM-02: entry missing configPath → skipped', result.written.length === 0);
  }

  // FM-03: entry is null
  {
    const root = makeRoot('fm03');
    writeMboConfig(root, { mcpClients: [null, { name: 'claude', configPath: '.mcp.json' }] });
    const result = updateClientConfigs(root, 9001, silent);
    record('FM-03: null entry → skipped but sibling ok', result.written.includes('.mcp.json'));
  }

  // FM-04: mcpClients not an array
  {
    const root = makeRoot('fm04');
    writeMboConfig(root, { mcpClients: 'not-an-array' });
    const result = updateClientConfigs(root, 9001, silent);
    record('FM-04: mcpClients not an array → no crash', result.written.length === 0);
  }

  // FM-05: config.json is directory
  {
    const root = makeRoot('fm05');
    fs.mkdirSync(path.join(root, '.mbo', 'config.json'), { recursive: true });
    const result = updateClientConfigs(root, 9001, silent);
    record('FM-05: config.json is directory → no crash', result.written.length === 0);
  }

  // FM-07: Port is negative
  {
    const root = makeRoot('fm07');
    writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
    const result = updateClientConfigs(root, -1, silent);
    record('FM-07: negative port → no write', result.written.length === 0);
  }

  // FM-11: projectRoot does not exist
  {
    const root = '/tmp/mbo-fm11-missing-' + Date.now();
    const result = updateClientConfigs(root, 9001, silent);
    record('FM-11: projectRoot missing → no crash', result.written.length === 0);
  }

  // FM-12: first fails, second ok
  {
    const root = makeRoot('fm12');
    fs.writeFileSync(path.join(root, 'blocker'), 'file');
    writeMboConfig(root, {
      mcpClients: [
        { name: 'bad', configPath: 'blocker/nested.json' },
        { name: 'ok',  configPath: '.mcp.json' }
      ]
    });
    const result = updateClientConfigs(root, 9001, silent);
    record('FM-12: failure in chain → continue', result.written.includes('.mcp.json'));
  }

  // FM-21: read-only config
  {
    const root = makeRoot('fm21');
    writeMboConfig(root, { mcpClients: [{ name: 'c', configPath: '.mcp.json' }] });
    const cfg = path.join(root, '.mbo', 'config.json');
    fs.chmodSync(cfg, 0o444);
    const reg = readRegistry(root);
    record('FM-21: read-only config → read ok', reg.length === 1);
    fs.chmodSync(cfg, 0o644);
  }

  for (const r of roots) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch(_) {}
  }

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Client Config Failure Mode Summary Table ─────────────────────');
  console.log('| Failure Mode                                   | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-client-config-failure-modes.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
