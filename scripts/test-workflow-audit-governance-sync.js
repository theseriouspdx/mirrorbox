'use strict';

/**
 * test-workflow-audit-governance-sync.js
 *
 * Verifies workflow-audit bug logging updates both BUGS.md and projecttracking.md.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { appendGovernanceFindings } = require('./mbo-workflow-audit.js');

const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'Workflow audit helper loaded', ok: typeof appendGovernanceFindings === 'function', detail: 'missing appendGovernanceFindings export' },
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
console.log('── Environment OK — proceeding with workflow audit governance sync test ─\n');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-audit-governance-'));
const governanceDir = path.join(fixtureRoot, '.dev', 'governance');
fs.mkdirSync(governanceDir, { recursive: true });

fs.writeFileSync(path.join(governanceDir, 'BUGS.md'), [
  '## Mirror Box Orchestrator — Outstanding Bugs',
  '',
  '**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.',
  '**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).',
  '**Next bug number:** BUG-201',
  '',
  '---',
].join('\n') + '\n', 'utf8');

fs.writeFileSync(path.join(governanceDir, 'projecttracking.md'), [
  '# projecttracking.md',
  '## Mirror Box Orchestrator — Canonical Task Ledger',
  '',
  '**Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]',
  '**Current Version:** 0.3.23',
  '**Next Task:** v0.2.08',
  '**Policy:** This file is the single source of truth for work state.',
  '',
  '---',
  '',
  '## Active Tasks',
  '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
  '|---|---|---|---|---|---|---|---|---|---|',
  '| v0.2.08 | bug | Existing workflow audit bug | READY | unassigned | - | 2026-03-24 | BUG-199 | - | existing |',
  '| v0.2.09 | bug | Existing workflow audit bug 2 | READY | unassigned | - | 2026-03-24 | BUG-200 | - | existing |',
  '',
  '---',
  '',
  '## Recently Completed',
  '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
  '|---|---|---|---|---|---|---|---|---|---|',
].join('\n') + '\n', 'utf8');

try {
  const result = appendGovernanceFindings(fixtureRoot, [
    {
      source: 'command:mirror:validator',
      severity: 'P1',
      title: 'Workflow check failed (mirror/mirror): Validator (all)',
      description: 'Command failed with exit code 1. See .mbo/logs/workflow-audit-x/mirror/validator.log.',
    },
  ]);

  const bugsText = fs.readFileSync(path.join(governanceDir, 'BUGS.md'), 'utf8');
  const projecttrackingText = fs.readFileSync(path.join(governanceDir, 'projecttracking.md'), 'utf8');

  const rows = [
    { label: 'Update reported', actual: String(result.updated), expected: 'true' },
    { label: 'Next bug number', actual: String(result.nextBug), expected: '202' },
    { label: 'Created task id', actual: String(result.taskIds[0]), expected: 'v0.2.10' },
    { label: 'BUGS.md dual label', actual: String(/### BUG-201 \/ v0\.2\.10 —/.test(bugsText)), expected: 'true' },
    { label: 'BUGS.md advanced', actual: String(/\*\*Next bug number:\*\* BUG-202/.test(bugsText)), expected: 'true' },
    { label: 'Task row added', actual: String(/\| v0\.2\.10 \| bug \| Workflow check failed \(mirror\/mirror\): Validator \(all\) \| READY \| unassigned \| - \|/.test(projecttrackingText)), expected: 'true' },
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

  console.log('PASS  test-workflow-audit-governance-sync.js');
} catch (error) {
  console.error('FAIL  test-workflow-audit-governance-sync.js');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
