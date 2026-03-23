#!/usr/bin/env node
'use strict';

/**
 * test-runtime-write-guard.js
 *
 * Verifies that the 'runtime' role cannot write to files outside the subjectRoot
 * (specifically, it cannot target MBO controller source files).
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
console.log('── Environment OK — proceeding with runtime-write-guard test ─────\n');

const MBO_ROOT = path.resolve(__dirname, '..');
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-runtime-guard-'));
fs.mkdirSync(path.join(runtimeRoot, '.mbo'), { recursive: true });

process.env.MBO_PROJECT_ROOT = runtimeRoot;

const { Operator } = require('../src/auth/operator');

const results = [];

async function main() {
  console.log('--- test-runtime-write-guard.js — Path Security Validation ---\n');
  const op = new Operator('runtime');
  
  // Build a relative path that resolves from runtimeRoot INTO MBO_ROOT/src/auth/operator.js
  const relativeTarget = path.relative(runtimeRoot, path.join(MBO_ROOT, 'src', 'auth', 'operator.js'));
  
  console.log(`Testing write guard for: ${relativeTarget}`);
  try {
    await op.runStage6('module.exports = 1;\n', [relativeTarget]);
    console.error('✗ FAIL: expected runtime write guard to block controller-targeted path');
    results.push({ label: 'Runtime Write Guard (Controller Protection)', status: 'FAIL' });
  } catch (err) {
    if (/Runtime writes cannot target controller files/.test(err.message)) {
      console.log('✓ PASS: runtime write guard blocks controller file targets');
      results.push({ label: 'Runtime Write Guard (Controller Protection)', status: 'PASS' });
    } else {
      console.error('✗ FAIL: unexpected error message: ' + err.message);
      results.push({ label: 'Runtime Write Guard (Controller Protection)', status: 'FAIL' });
    }
  }

  // Cleanup
  fs.rmSync(runtimeRoot, { recursive: true, force: true });

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Security Guard Summary Table ──────────────────────────────────');
  console.log('| Security Check                                 | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-runtime-write-guard.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
