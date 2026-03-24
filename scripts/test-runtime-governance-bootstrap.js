'use strict';

/**
 * test-runtime-governance-bootstrap.js
 *
 * Verifies runtime governance bootstrap seeds canonical docs under .mbo/governance.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { initProject } = require('../src/cli/init-project.js');
const { ensureGovernanceDocs } = require('../src/cli/onboarding.js');

const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'initProject available', ok: typeof initProject === 'function', detail: 'missing initProject export' },
  { label: 'ensureGovernanceDocs available', ok: typeof ensureGovernanceDocs === 'function', detail: 'missing ensureGovernanceDocs export' },
];

let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) {
  console.log('\nEnvironment checks failed — aborting.\n');
  process.exit(2);
}
console.log('── Environment OK — proceeding with runtime governance bootstrap test ─\n');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-runtime-governance-'));

try {
  initProject(fixtureRoot);
  ensureGovernanceDocs(fixtureRoot);

  const runtimeGov = path.join(fixtureRoot, '.mbo', 'governance');
  const runtimeProjecttracking = path.join(runtimeGov, 'projecttracking.md');
  const runtimeBugs = path.join(runtimeGov, 'BUGS.md');
  const legacyDevProjecttracking = path.join(fixtureRoot, '.dev', 'governance', 'projecttracking.md');

  const rows = [
    { label: 'Runtime gov dir', actual: String(fs.existsSync(runtimeGov)), expected: 'true' },
    { label: 'Runtime projecttracking', actual: String(fs.existsSync(runtimeProjecttracking)), expected: 'true' },
    { label: 'Runtime BUGS', actual: String(fs.existsSync(runtimeBugs)), expected: 'true' },
    { label: 'Legacy .dev bootstrap', actual: String(fs.existsSync(legacyDevProjecttracking)), expected: 'false' },
    { label: 'Canonical heading', actual: String(fs.readFileSync(runtimeProjecttracking, 'utf8').includes('## Active Tasks')), expected: 'true' },
  ];

  console.log('── Live Output Table ────────────────────────────────────────────');
  console.log('| Check               | Actual       | Expected     |');
  console.log('| ------------------- | ------------ | ------------ |');
  for (const row of rows) {
    console.log(`| ${row.label.padEnd(19)} | ${String(row.actual).padEnd(12)} | ${String(row.expected).padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  for (const row of rows) {
    assert.strictEqual(row.actual, row.expected, `${row.label} mismatch`);
  }

  console.log('PASS  test-runtime-governance-bootstrap.js');
} catch (error) {
  console.error('FAIL  test-runtime-governance-bootstrap.js');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
