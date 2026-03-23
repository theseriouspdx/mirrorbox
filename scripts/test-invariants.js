'use strict';

const Database = require('better-sqlite3');
const assert = require('assert');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const DB_PATH = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db');
const PROJECT_ROOT = process.env.MBO_PROJECT_ROOT || path.resolve(__dirname, '..');

// ── Rule 1: Environment Assertions ───────────────────────────────────────────
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'Project root exists', ok: fs.existsSync(PROJECT_ROOT), detail: `not found at ${PROJECT_ROOT}` },
  { label: 'validator.py exists', ok: fs.existsSync(path.join(PROJECT_ROOT, 'bin/validator.py')), detail: 'bin/validator.py missing' }
];
let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
console.log('── Environment OK — proceeding with invariants test ──────────────\n');

function runCommand(command, stdio = 'pipe') {
  try {
    return {
      success: true,
      stdout: execSync(command, { stdio, cwd: PROJECT_ROOT, env: { ...process.env, MBO_PROJECT_ROOT: PROJECT_ROOT } }).toString()
    };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : ''
    };
  }
}

const results = [];

async function testInvariant1And2() {
  console.log('Testing Invariant 1 & 2: File Protection & Project Root...');
  
  const srcPath = path.join(PROJECT_ROOT, 'src');
  const sessionLock = path.join(PROJECT_ROOT, '.journal/session.lock');
  
  const stats = fs.statSync(srcPath);
  const mode = stats.mode & 0o777;
  const isReadOnly = (mode & 0o222) === 0; // No write bit for owner, group, or others
  
  if (isReadOnly) {
    console.log(`  PASS: src/ directory is read-only (mode: ${mode.toString(8)}).`);
    results.push({ label: 'Inv 1/2: src/ protection', status: 'PASS' });
  } else if (fs.existsSync(sessionLock)) {
    console.log(`  PASS: src/ is writable (mode: ${mode.toString(8)}) but an active session.lock was detected. [AUTHORIZED]`);
    results.push({ label: 'Inv 1/2: src/ protection', status: 'PASS (Lock)' });
  } else {
    console.error(`  FAIL: src/ directory is NOT read-only (mode: ${mode.toString(8)}).`);
    results.push({ label: 'Inv 1/2: src/ protection', status: 'FAIL' });
    process.exit(1);
  }
}

async function testInvariant4() {
  console.log('Testing Invariant 4: Event Store Reproducibility...');
  const result = runCommand('node scripts/verify-chain.js');
  if (result.success) {
    console.log('  PASS: Chain integrity verified.');
    results.push({ label: 'Inv 4: Chain integrity', status: 'PASS' });
  } else {
    console.error('  FAIL: Chain integrity breach detected!');
    console.error(result.stdout);
    results.push({ label: 'Inv 4: Chain integrity', status: 'FAIL' });
    process.exit(1);
  }
}

async function testInvariant10() {
  console.log('Testing Invariant 10: Entropy Tax...');
  const result = runCommand('python3 bin/validator.py --all');
  if (result.success) {
    console.log('  PASS: Entropy tax paid (All files pass).');
    results.push({ label: 'Inv 10: Entropy tax', status: 'PASS' });
  } else {
    console.error('  FAIL: Entropy tax failure detected!');
    console.error(result.stdout);
    results.push({ label: 'Inv 10: Entropy tax', status: 'FAIL' });
    process.exit(1);
  }
}

async function testInvariant11() {
  console.log('Testing Invariant 11: Cell Bootstrapping...');
  if (fs.existsSync(path.join(PROJECT_ROOT, 'bin/validator.py'))) {
    console.log('  PASS: bin/validator.py exists for bootstrapping enforcement.');
    results.push({ label: 'Inv 11: Bootstrapping', status: 'PASS' });
  } else {
    console.error('  FAIL: bin/validator.py missing.');
    results.push({ label: 'Inv 11: Bootstrapping', status: 'FAIL' });
    process.exit(1);
  }
}

async function runAllTests() {
  console.log('--- Mirror Box External Invariant Test Suite ---\n');
  
  await testInvariant1And2();
  await testInvariant4();
  await testInvariant10();
  await testInvariant11();

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Invariants Summary Table ────────────────────────────────────');
  console.log('| Invariant Label                                | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  console.log('\n--- Invariant Test Suite Complete ---');
}

runAllTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
