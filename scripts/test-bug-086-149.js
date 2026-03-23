#!/usr/bin/env node
'use strict';

/**
 * test-bug-086-149.js
 *
 * Regression tests for:
 *   BUG-086: Legacy profile without projectRoot field should trigger re-onboarding.
 *   BUG-149: Live interview path must use callModel and persist correctly.
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
console.log('── Environment OK — proceeding with bug-086-149 test ─────────────\n');

const results = [];

function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mktempProject(prefix = 'mbo-bug-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, '.mbo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'tmp', version: '0.0.0' }, null, 2));
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'module.exports = 1;\n');
  return root;
}

// ─── BUG-086: Legacy Profile Without Root ─────────────────────────────────────
async function testBug086() {
  const { checkOnboarding } = require('../src/cli/onboarding');
  const projectRoot = mktempProject('mbo-bug086-');

  const legacyProfile = {
    primeDirective: 'keep auth stable',
    users: 'internal',
    onboardingVersion: 1,
    binaryVersion: '0.11.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(projectRoot, '.mbo', 'onboarding.json'),
    JSON.stringify(legacyProfile, null, 2) + '\n',
    'utf8'
  );

  const status = await checkOnboarding(projectRoot, { autoRun: false, returnStatus: true });
  const ok = status.needsOnboarding === true && status.reason === 'profile_drift';
  record('BUG-086: legacy profile triggers drift', ok);
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

// ─── BUG-149: Live Interview Persistence ──────────────────────────────────────
async function testBug149() {
  const callModelModule = require('../src/auth/call-model');
  const originalCallModel = callModelModule.callModel;

  let calls = 0;
  callModelModule.callModel = async (_role, _prompt) => {
    calls += 1;
    if (calls === 1) return 'What is your top priority?';
    return '---WORKING AGREEMENT---\nprime_directive: Keep auth stable\nproject_type: existing\n---END---';
  };

  delete require.cache[require.resolve('../src/cli/onboarding')];
  const { runOnboarding } = require('../src/cli/onboarding');

  const projectRoot = mktempProject('mbo-bug149-');
  const io = {
    ask: async (_prompt, def = '') => 'Accept',
    close: () => {},
  };

  try {
    const profile = await runOnboarding(projectRoot, null, { nonInteractive: false }, io);
    const persisted = JSON.parse(fs.readFileSync(path.join(projectRoot, '.mbo', 'onboarding.json'), 'utf8'));
    const ok = calls >= 2 && profile && persisted.primeDirective === 'Keep auth stable';
    record('BUG-149: live interview persists profile', ok);
  } finally {
    callModelModule.callModel = originalCallModel;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

async function main() {
  console.log('--- test-bug-086-149.js — Regression Checks ---\n');
  await testBug086();
  await testBug149();

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Bug Regression Summary Table ─────────────────────────────────');
  console.log('| Bug ID                                         | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-bug-086-149.js');
}

main().catch((err) => {
  console.error('\nFAIL test-bug-086-149.js:', err.message);
  process.exit(1);
});
