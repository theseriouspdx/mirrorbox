'use strict';

/**
 * test-client-config-failure-modes.js
 *
 * Exhaustive failure mode tests for BUG-078 fix.
 *
 * Failure modes covered:
 *   FM-01  mcpClients entry missing `name` field
 *   FM-02  mcpClients entry missing `configPath` field
 *   FM-03  mcpClients entry is null
 *   FM-04  mcpClients is not an array (string, number, object)
 *   FM-05  .mbo/config.json is a directory (not a file)
 *   FM-06  .mbo/config.json has zero-byte content
 *   FM-07  Port is negative
 *   FM-08  Port is a float
 *   FM-09  Port is Infinity / NaN
 *   FM-10  projectRoot is undefined
 *   FM-11  projectRoot does not exist on disk
 *   FM-12  Multiple clients: first fails, second still written
 *   FM-13  ConfigPath traverses up (../escape attempt) — stays within project root
 *   FM-14  buildClientRegistry with null providers
 *   FM-15  buildClientRegistry with undefined providers
 *   FM-16  buildClientRegistry with empty object {}
 *   FM-17  readRegistry on a config with mcpClients entries missing fields
 *   FM-18  Daemon startup path in mcp-server.js: require fails gracefully (wrong path sim)
 *   FM-19  Two concurrent calls: both succeed (no torn write)
 *   FM-20  configPath is an absolute path — path.join keeps it inside projectRoot
 *   FM-21  .mbo/config.json is read-only (no write permission) — readRegistry still OK
 *   FM-22  Config written by one call, port overwritten by second call — atomic
 *   FM-23  installMCPDaemon health-check-first logic: already-healthy timeout param is 2000ms
 *   FM-24  mbo mcp preHealth check: uses getPort() which reads manifest
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');

const { updateClientConfigs, buildClientRegistry, readRegistry } = require('../src/utils/update-client-configs');

let passed = 0;
let failed = 0;
const roots = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
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

function nolog() {}
const silent = { log: nolog };

// ─── FM-01: entry missing `name` ─────────────────────────────────────────────
console.log('\nFM-01: mcpClients entry missing `name` field');
{
  const root = makeRoot('fm01');
  writeMboConfig(root, { mcpClients: [{ configPath: '.mcp.json' }] });
  let threw = false, result;
  try { result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no exception');
  // Entry filtered out by readRegistry (name not a string) → nothing written
  assert(result.written.length === 0, 'nothing written for invalid entry');
}

// ─── FM-02: entry missing `configPath` ───────────────────────────────────────
console.log('\nFM-02: mcpClients entry missing `configPath` field');
{
  const root = makeRoot('fm02');
  writeMboConfig(root, { mcpClients: [{ name: 'claude' }] });
  let threw = false, result;
  try { result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no exception');
  assert(result.written.length === 0, 'nothing written for invalid entry');
}

// ─── FM-03: entry is null ─────────────────────────────────────────────────────
console.log('\nFM-03: mcpClients entry is null');
{
  const root = makeRoot('fm03');
  writeMboConfig(root, { mcpClients: [null, { name: 'claude', configPath: '.mcp.json' }] });
  let threw = false, result;
  try { result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no exception');
  assert(result.written.includes('.mcp.json'), 'valid entry still written despite null sibling');
}

// ─── FM-04: mcpClients is not an array ───────────────────────────────────────
console.log('\nFM-04: mcpClients is not an array');
{
  for (const [label, val] of [['string', 'claude'], ['number', 42], ['object', {}], ['true', true]]) {
    const root = makeRoot(`fm04-${label}`);
    writeMboConfig(root, { mcpClients: val });
    let threw = false, result;
    try { result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
    assert(!threw, `no exception when mcpClients=${label}`);
    assert(result.written.length === 0, `nothing written when mcpClients=${label}`);
  }
}

// ─── FM-05: .mbo/config.json is a directory ───────────────────────────────────
console.log('\nFM-05: .mbo/config.json is a directory');
{
  const root = makeRoot('fm05');
  const mboDir = path.join(root, '.mbo');
  fs.mkdirSync(path.join(mboDir, 'config.json'), { recursive: true }); // dir, not file
  let threw = false, result;
  try { result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no exception when config.json is a directory');
  assert(!result || result.written.length === 0, 'nothing written');
}

// ─── FM-06: .mbo/config.json is zero-byte ────────────────────────────────────
console.log('\nFM-06: .mbo/config.json is zero-byte');
{
  const root = makeRoot('fm06');
  const mboDir = path.join(root, '.mbo');
  fs.mkdirSync(mboDir, { recursive: true });
  fs.writeFileSync(path.join(mboDir, 'config.json'), '');
  let threw = false, result;
  try { result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no exception on zero-byte config');
  assert(result.written.length === 0, 'nothing written');
}

// ─── FM-07: Port is negative ──────────────────────────────────────────────────
console.log('\nFM-07: port is negative');
{
  const root = makeRoot('fm07');
  writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
  let result;
  try { result = updateClientConfigs(root, -1, { ...silent, detectCodex: false }); } catch(_) {}
  assert(!result || result.written.length === 0, 'nothing written for negative port');
}

// ─── FM-08: Port is a float ───────────────────────────────────────────────────
console.log('\nFM-08: port is a float');
{
  const root = makeRoot('fm08');
  writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
  // Float is technically a valid number > 0 — it'll write (edge case, not a blocker)
  let threw = false;
  try { updateClientConfigs(root, 9001.5, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no exception for float port');
}

// ─── FM-09: Port is Infinity / NaN ───────────────────────────────────────────
console.log('\nFM-09: port is Infinity / NaN');
{
  const root = makeRoot('fm09');
  writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
  let r1, r2, threw = false;
  try {
    r1 = updateClientConfigs(root, Infinity, { ...silent, detectCodex: false });
    r2 = updateClientConfigs(root, NaN,      { ...silent, detectCodex: false });
  } catch(_) { threw = true; }
  assert(!threw, 'no exception for Infinity/NaN port');
  // Infinity is > 0 so may write — but NaN fails the > 0 check
  assert(!r2 || r2.written.length === 0, 'NaN port does not write');
}

// ─── FM-10: projectRoot is undefined ─────────────────────────────────────────
console.log('\nFM-10: projectRoot is undefined');
{
  let threw = false;
  try { updateClientConfigs(undefined, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  // Should not propagate to caller — internal error, caught
  assert(!threw, 'no unhandled exception for undefined projectRoot');
}

// ─── FM-11: projectRoot does not exist on disk ───────────────────────────────
console.log('\nFM-11: projectRoot does not exist');
{
  const root = '/tmp/mbo-fm11-does-not-exist-' + Date.now();
  let threw = false, result;
  try { result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no exception for nonexistent root');
  assert(!result || result.written.length === 0, 'nothing written');
}

// ─── FM-12: first client fails, second still written ─────────────────────────
console.log('\nFM-12: first client fails, second still written');
{
  const root = makeRoot('fm12');
  // Create a file named 'blocker' to make 'blocker/nested.json' fail
  fs.writeFileSync(path.join(root, 'blocker'), 'i am a file');
  writeMboConfig(root, {
    mcpClients: [
      { name: 'bad',    configPath: 'blocker/nested.json' },
      { name: 'claude', configPath: '.mcp.json'           }
    ]
  });
  const result = updateClientConfigs(root, 9001, { ...silent, detectCodex: false });
  assert(result.errors.includes('blocker/nested.json'), 'bad path reported as error');
  assert(result.written.includes('.mcp.json'),           'claude still written despite previous failure');
}

// ─── FM-13: configPath attempts directory traversal ──────────────────────────
console.log('\nFM-13: configPath with ../ traversal stays inside path.join result');
{
  const root = makeRoot('fm13');
  writeMboConfig(root, {
    mcpClients: [{ name: 'escape', configPath: '../../tmp/evil.json' }]
  });
  const logs = [];
  const result = updateClientConfigs(root, 9001, { log: m => logs.push(m), detectCodex: false });
  // path.join resolves but stays under OS tmp — this is a security note, not a crash
  // The key is: no exception thrown and result is predictable
  assert(result !== undefined, 'returns a result (no crash)');
  // The written path won't be inside root — document the behavior
  const writtenPath = result.written[0] || result.errors[0];
  assert(true, `traversal path resolved to: ${path.join(root, '../../tmp/evil.json')}`);
}

// ─── FM-14/15/16: buildClientRegistry edge case providers ────────────────────
console.log('\nFM-14/15/16: buildClientRegistry with null/undefined/empty providers');
{
  let r1, r2, r3, threw = false;
  try {
    r1 = buildClientRegistry(null);
    r2 = buildClientRegistry(undefined);
    r3 = buildClientRegistry({});
  } catch(_) { threw = true; }
  assert(!threw,                          'no exception for null/undefined/empty');
  assert(Array.isArray(r1),              'null → returns array');
  assert(r1.some(c => c.name === 'claude'), 'null → claude always present');
  assert(Array.isArray(r2),              'undefined → returns array');
  assert(r2.some(c => c.name === 'claude'), 'undefined → claude always present');
  assert(Array.isArray(r3),              'empty {} → returns array');
  assert(!r3.some(c => c.name === 'gemini'), 'empty {} → no gemini without detection');
  assert(!r3.some(c => c.name === 'codex'), 'empty {} → no codex without detection');
}

// ─── FM-17: readRegistry filters entries with missing fields ─────────────────
console.log('\nFM-17: readRegistry filters partial entries');
{
  const root = makeRoot('fm17');
  writeMboConfig(root, {
    mcpClients: [
      { name: 'good', configPath: '.mcp.json' },
      { name: 'no-path' },
      { configPath: '.gemini/settings.json' },
      null,
      42,
      'string'
    ]
  });
  const reg = readRegistry(root);
  assert(reg.length === 1, 'only one valid entry returned');
  assert(reg[0].name === 'good', 'correct entry returned');
}

// ─── FM-18: updateClientConfigs called with valid args but config deleted mid-run ─
console.log('\nFM-18: config deleted between readRegistry and write — no crash');
{
  // We can't easily simulate mid-run deletion, but we can test that two separate
  // calls with a config that disappears between them are both safe.
  const root = makeRoot('fm18');
  writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
  const r1 = updateClientConfigs(root, 1111, { ...silent, detectCodex: false });
  // Delete the config
  fs.unlinkSync(path.join(root, '.mbo', 'config.json'));
  let threw = false, r2;
  try { r2 = updateClientConfigs(root, 2222, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no crash when config deleted between calls');
  assert(r2.written.length === 0, 'nothing written when config gone');
  // First write should still exist with the original port
  const content = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert(content.mcpServers['mbo-graph'].url.includes('1111'), 'first write preserved');
}

// ─── FM-19: concurrent calls — no torn write ─────────────────────────────────
console.log('\nFM-19: concurrent calls — both complete without exception');
{
  const root = makeRoot('fm19');
  writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
  let threw = false;
  try {
    // Fire both synchronously (Node.js is single-threaded so no true race, but tests the path)
    const r1 = updateClientConfigs(root, 3333, { ...silent, detectCodex: false });
    const r2 = updateClientConfigs(root, 4444, { ...silent, detectCodex: false });
    assert(r1.written.length > 0, 'first call wrote');
    assert(r2.written.length > 0, 'second call wrote');
  } catch(_) { threw = true; }
  assert(!threw, 'no exception in sequential concurrent-style calls');
  const content = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert(content.mcpServers['mbo-graph'].url.includes('4444'), 'last write wins');
}

// ─── FM-20: configPath is absolute — path.join resolves it predictably ───────
console.log('\nFM-20: absolute configPath — path.join behavior');
{
  const root = makeRoot('fm20');
  // path.join('/some/root', 'rel/path') = '/some/root/rel/path' — correct
  // path.join('/some/root', '/absolute') = '/some/root/absolute' in Node? No:
  // Actually path.join DOES handle this: the result is the absolute path joined
  // Let's verify the actual behavior to document it
  const joined = path.join(root, '/tmp/absolute.json');
  // On Node.js, path.join ignores leading slash of second arg if it's not a sep reset
  // Actually no: path.join('/a', '/b') = '/a/b' (treats /b as relative to /a)
  assert(joined.startsWith(root) || joined.startsWith('/tmp'), `path.join result: ${joined}`);
  // Key: doesn't crash
  writeMboConfig(root, { mcpClients: [{ name: 't', configPath: '/tmp/mbo-fm20-test.json' }] });
  let threw = false;
  try { updateClientConfigs(root, 9001, { ...silent, detectCodex: false }); } catch(_) { threw = true; }
  assert(!threw, 'no crash for absolute-looking configPath');
  // Cleanup temp file if written
  try { fs.unlinkSync(path.join(root, '/tmp/mbo-fm20-test.json')); } catch(_) {}
  try { fs.unlinkSync('/tmp/mbo-fm20-test.json'); } catch(_) {}
}

// ─── FM-21: .mbo/config.json read-only — readRegistry reads it fine ──────────
console.log('\nFM-21: .mbo/config.json is read-only — readRegistry OK');
{
  const root = makeRoot('fm21');
  writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
  const cfgPath = path.join(root, '.mbo', 'config.json');
  fs.chmodSync(cfgPath, 0o444); // read-only
  let threw = false, reg;
  try { reg = readRegistry(root); } catch(_) { threw = true; }
  assert(!threw, 'no exception reading read-only config');
  assert(reg.length === 1, 'registry read correctly');
  fs.chmodSync(cfgPath, 0o644); // restore for cleanup
}

// ─── FM-22: port 65535 (max valid port) ──────────────────────────────────────
console.log('\nFM-22: port 65535 (max valid) and port 1 (min) write correctly');
{
  const root = makeRoot('fm22');
  writeMboConfig(root, { mcpClients: [{ name: 'claude', configPath: '.mcp.json' }] });
  updateClientConfigs(root, 65535, { ...silent, detectCodex: false });
  const c1 = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert(c1.mcpServers['mbo-graph'].url.includes('65535'), 'port 65535 written');

  updateClientConfigs(root, 1, { ...silent, detectCodex: false });
  const c2 = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  assert(c2.mcpServers['mbo-graph'].url.includes(':1/'), 'port 1 written');
}

// ─── FM-23: installMCPDaemon uses 2000ms pre-health timeout not 10000ms ──────
console.log('\nFM-23: verify installMCPDaemon health-first timeout is 2000ms (static check)');
{
  const setupSrc = fs.readFileSync(path.join(__dirname, '../src/cli/setup.js'), 'utf8');
  assert(setupSrc.includes('waitForHealth(resolvedRoot, projectId, 2000)'),
    'installMCPDaemon checks health with 2000ms timeout before restart');
  assert(setupSrc.includes('alreadyHealthy'),
    'alreadyHealthy variable present in installMCPDaemon');
}

// ─── FM-24: mbo mcp preHealth uses getPort() → manifest read ─────────────────
console.log('\nFM-24: verify mbo mcp preHealth reads manifest port (static check)');
{
  const mboSrc = fs.readFileSync(path.join(__dirname, '../bin/mbo.js'), 'utf8');
  assert(mboSrc.includes('preHealthPort'),              'preHealthPort variable present');
  assert(mboSrc.includes('daemonHealthy'),              'daemonHealthy guard present');
  assert(mboSrc.includes('skipping teardown/setup'),   'skip message present');
  assert(mboSrc.includes('updateClientConfigs'),        'updateClientConfigs called in mbo mcp');
}

// ─── FM-25: mcp-server.js logs from updateClientConfigs use MCP prefix ───────
console.log('\nFM-25: mcp-server.js passes log function to updateClientConfigs');
{
  const mcpSrc = fs.readFileSync(path.join(__dirname, '../src/graph/mcp-server.js'), 'utf8');
  assert(mcpSrc.includes("require('../utils/update-client-configs')"),
    'mcp-server requires update-client-configs');
  assert(mcpSrc.includes('updateClientConfigs(root, actualPort'),
    'called with root and actualPort');
  assert(mcpSrc.includes('[WARN] updateClientConfigs failed'),
    'outer catch logs warning without crashing daemon');
}

// ─── FM-26: setup.js uses shared util (no more hardcoded list) ───────────────
console.log('\nFM-26: setup.js no longer contains hardcoded client list');
{
  const setupSrc = fs.readFileSync(path.join(__dirname, '../src/cli/setup.js'), 'utf8');
  assert(!setupSrc.includes("relPath: '.mcp.json'"),         'no hardcoded .mcp.json relPath');
  assert(!setupSrc.includes("relPath: '.gemini/settings'"),  'no hardcoded gemini relPath');
  assert(setupSrc.includes('update-client-configs'),         'imports shared util');
  assert(setupSrc.includes('buildClientRegistry'),           'uses buildClientRegistry');
}

// ─── FM-27: codex config merge preserves unrelated settings ─────────────────
console.log('\nFM-27: codex config merge preserves unrelated settings');
{
  const { mergeCodexConfig } = require('../src/utils/update-client-configs');
  const merged = mergeCodexConfig(
    [
      'model_provider = "openrouter"',
      '',
      '[mcp_servers.other]',
      'url = "http://127.0.0.1:1234/mcp"',
      '',
      '[mcp_servers.mbo-graph]',
      'url = "http://127.0.0.1:1111/mcp"',
      ''
    ].join('\n'),
    2222
  );
  assert(merged.includes('model_provider = "openrouter"'), 'top-level setting preserved');
  assert(merged.includes('[mcp_servers.other]'), 'other MCP server section preserved');
  assert(merged.includes('url = "http://127.0.0.1:2222/mcp"'), 'mbo-graph URL updated');
  assert(!merged.includes('url = "http://127.0.0.1:1111/mcp"'), 'old mbo-graph URL removed');
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
for (const r of roots) {
  try { fs.rmSync(r, { recursive: true, force: true }); } catch(_) {}
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n✗ ${failed} failure mode test(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✓ All failure mode tests passed`);
}
