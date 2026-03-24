'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runBugAudit } = require('../src/cli/bug-audit.js');

const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'runBugAudit available', ok: typeof runBugAudit === 'function', detail: 'missing runBugAudit export' },
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
console.log('── Environment OK — proceeding with bug audit test ──────────────\n');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-bug-audit-'));
const devGov = path.join(fixtureRoot, '.dev', 'governance');
fs.mkdirSync(devGov, { recursive: true });
fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });

fs.writeFileSync(path.join(fixtureRoot, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.3.24' }, null, 2), 'utf8');
fs.writeFileSync(path.join(devGov, 'CHANGELOG.md'), [
  '# CHANGELOG.md',
  '## [0.3.24] — 2026-03-24 — Fixture',
].join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(devGov, 'BUGS.md'), [
  '## Mirror Box Orchestrator — Outstanding Bugs',
  '',
  '**Next bug number:** BUG-205',
  '',
  '---',
].join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(devGov, 'projecttracking.md'), [
  '# projecttracking.md',
  '**Current Version:** 0.3.24',
  '**Next Task:** v0.3.26',
  '## Active Tasks',
  '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
  '|---|---|---|---|---|---|---|---|---|---|',
  '| v0.3.24 | bug | Completed row still under active | COMPLETED | unassigned | - | 2026-03-24 | BUG-201 | - | done |',
  '| v0.3.25 | bug | Latest completed row still under active | COMPLETED | unassigned | - | 2026-03-24 | BUG-202 | - | done |',
  '',
  '---',
  '',
  '## Recently Completed',
  '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
  '|---|---|---|---|---|---|---|---|---|---|',
].join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(fixtureRoot, 'tsconfig.tui.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: [] }, null, 2), 'utf8');
fs.writeFileSync(path.join(fixtureRoot, 'src', 'ok.js'), 'module.exports = 1;\n', 'utf8');

try {
  const result = runBugAudit({ projectRoot: fixtureRoot });
  const bugsText = fs.readFileSync(result.bugsReportPath, 'utf8');
  const resolvedText = fs.readFileSync(result.resolvedReportPath, 'utf8');

  const rows = [
    { label: 'Run directory exists', actual: String(fs.existsSync(result.runDir)), expected: 'true' },
    { label: 'bugs.md exists', actual: String(fs.existsSync(result.bugsReportPath)), expected: 'true' },
    { label: 'bugsresolved exists', actual: String(fs.existsSync(result.resolvedReportPath)), expected: 'true' },
    { label: 'Finding count', actual: String(result.findings.length), expected: '2' },
    { label: 'Summary mentions findings', actual: String(/2 finding\(s\)/.test(result.summaryLine)), expected: 'true' },
    { label: 'bugs.md records next task issue', actual: String(/Next Task header/.test(bugsText)), expected: 'true' },
    { label: 'bugs.md records active completed issue', actual: String(/Active tasks do not contain completed rows/.test(bugsText)), expected: 'true' },
    { label: 'bugsresolved records syntax pass', actual: String(/JavaScript syntax/.test(resolvedText)), expected: 'true' },
  ];

  console.log('── Live Output Table ────────────────────────────────────────────');
  console.log('| Check                    | Actual       | Expected     |');
  console.log('| ------------------------ | ------------ | ------------ |');
  for (const row of rows) {
    console.log(`| ${row.label.padEnd(24)} | ${String(row.actual).padEnd(12)} | ${String(row.expected).padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  rows.forEach((row) => assert.strictEqual(row.actual, row.expected, `${row.label} mismatch`));
  console.log('PASS  test-bug-audit.js');
} catch (error) {
  console.error('FAIL  test-bug-audit.js');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
