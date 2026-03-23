'use strict';

/**
 * tests/run-all.js
 *
 * Orchestrates the execution of the entire MBO test suite.
 * Discovers and runs all hardened test scripts in scripts/ and tests/.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
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
console.log('── Environment OK — proceeding with full suite execution ──────────\n');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');

function runTest(cmd, args, label) {
  console.log(`\n======================================================`);
  console.log(`▶ RUNNING: ${label}`);
  console.log(`======================================================`);
  
  const result = spawnSync(cmd, args, { 
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    env: { 
      ...process.env, 
      MBO_PROJECT_ROOT: PROJECT_ROOT,
      MBO_SKIP_BUG_076: '1',
    }
  });

  return result.status === 0;
}

async function main() {
  console.log('--- MBO Master Test Suite Runner ---\n');
  
  const testScripts = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => (f.startsWith('test-') || f.startsWith('verify-')) && (f.endsWith('.js') || f.endsWith('.py')))
    .map(f => ({ path: path.join(SCRIPTS_DIR, f), name: f, lang: f.endsWith('.py') ? 'python3' : 'node' }));

  const testDirFiles = fs.readdirSync(TESTS_DIR)
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .map(f => ({ path: path.join(TESTS_DIR, f), name: f, lang: 'node' }));

  const allTests = [...testScripts, ...testDirFiles];

  // Force test-state.js to run first to seed the DB
  allTests.sort((a, b) => (a.name === 'test-state.js' ? -1 : b.name === 'test-state.js' ? 1 : 0));

  console.log(`Found ${allTests.length} test scripts. Running sequentially...\n`);

  const results = [];
  for (const test of allTests) {
    const ok = runTest(test.lang, [test.path], test.name);
    results.push({ label: test.name, status: ok ? 'PASS' : 'FAIL' });
  }

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Master Test Suite Summary Table ──────────────────────────────');
  console.log('| Test Script                                    | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) {
    console.error(`\nFAIL: ${failedCount} tests failed.`);
    process.exit(1);
  }
  console.log('🎉 All tests passed successfully!');
}

main().catch(console.error);
