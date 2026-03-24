'use strict';

/**
 * test-tui-governance-task-creation.js
 *
 * Verifies TUI governance helpers choose the real governance ledger,
 * hide completed rows from the active task surface, do not pre-assign owners,
 * and derive the next lane-scoped task id from the highest existing suffix.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'Project root exists', ok: fs.existsSync(PROJECT_ROOT), detail: PROJECT_ROOT },
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
console.log('── Environment OK — proceeding with governance task creation test ─\n');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-governance-task-'));
const governanceDir = path.join(fixtureRoot, '.dev', 'governance');
fs.mkdirSync(governanceDir, { recursive: true });
fs.writeFileSync(path.join(governanceDir, 'BUGS.md'), '# BUGS\n', 'utf8');
fs.writeFileSync(path.join(governanceDir, 'BUGS-resolved.md'), '# BUGS-resolved\n', 'utf8');
fs.writeFileSync(path.join(governanceDir, 'CHANGELOG.md'), '# CHANGELOG\n', 'utf8');
fs.writeFileSync(path.join(governanceDir, 'projecttracking.md'), [
  '# projecttracking.md',
  '**Current Version:** 0.3.24',
  '**Next Task:** v0.3.24',
  '## Active Tasks',
  '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
  '|---|---|---|---|---|---|---|---|---|---|',
  '| v0.3.01 | bug | Already burned task id | COMPLETED | claude | - | 2026-03-20 | BUG-178 | - | historical |',
  '| v0.3.10 | bug | Existing TUI task | COMPLETED | claude | - | 2026-03-20 | BUG-183 | - | historical |',
  '| v0.3.23 | bug | Latest TUI task | COMPLETED | claude | - | 2026-03-23 | BUG-196 | - | historical |',
  '',
  '---',
  '',
  '## Recently Completed',
  '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
  '|---|---|---|---|---|---|---|---|---|---|',
].join('\n'), 'utf8');

function transpileGovernanceModule(source) {
  let code = source
    .split('\n')
    // Remove ESM/Node module helpers and imports
    .filter(line => !line.trim().startsWith('import '))
    .filter(line => !line.includes('createRequire(import.meta.url)'))
    .join('\n');

  // Strip 'export' keyword
  code = code.replace(/\bexport\s+/g, '');

  // Strip interfaces and types (multiline)
  code = code.replace(/interface [^{]+\{[\s\S]*?\n\}/g, '');
  code = code.replace(/type [^;]+;/g, '');

  // 1. Strip generics: <...>
  // Use negative lookahead to avoid stripping comparison operators (< 9, <= 9)
  code = code.replace(/<(?![ =])[^>]+>/g, '');

  // 2. Strip return types in function declarations
  // Handle object return types: ): { ... } {
  code = code.replace(/\): \{[^\}]+\}(?=\s*\{)/g, ')');
  // Handle simple return types: ): Type {
  code = code.replace(/\): [a-zA-Z0-9_| '\[\]]+(?=\s*\{)/g, ')');

  // 3. Strip variable/parameter types: name: Type
  // Use a targeted list of types to avoid matching colons in object literals/ternaries.
  const knownTypes = [
    'string', 'number', 'boolean', 'any', 'void', 'null',
    'TaskRecord', 'GovernanceDoc', 'TaskDraftInput', 'TaskActivationInput', 'GovernanceSummary', 'GovernanceDocKey',
    'Array', 'Set', "'active' \\| 'recent' \\| null"
  ];
  // Allow optional space before the terminal character in lookahead
  const typeRegex = new RegExp(': (?:' + knownTypes.join('|') + ')(?:\\[\\])?(?=\\s*[,;=)\\n])', 'g');
  code = code.replace(typeRegex, '');

  // 4. Strip 'as' assertions
  code = code.replace(/\s+as\s+[A-Za-z0-9_.]+/g, '');

  return code + '\nmodule.exports = { findGovernanceDir, readGovernanceSummary, parseTaskLedger, deriveNextTaskId, createTaskFromDraft };\n';
}

function loadGovernanceHelpers() {
  const governancePath = path.join(PROJECT_ROOT, 'src', 'tui', 'governance.ts');
  const source = fs.readFileSync(governancePath, 'utf8');
  const transformed = transpileGovernanceModule(source);
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require: (name) => {
      if (name === 'module') {
        return { createRequire: () => require };
      }
      return require(name);
    },
    console,
    process,
    __dirname: path.dirname(governancePath),
    __filename: governancePath,
  };
  vm.runInNewContext(transformed, sandbox, { filename: governancePath });
  return sandbox.module.exports;
}

try {
  const runtimeGov = path.join(fixtureRoot, '.mbo', 'governance');
  fs.mkdirSync(runtimeGov, { recursive: true });
  fs.writeFileSync(path.join(runtimeGov, 'BUGS.md'), '# BUGS\n', 'utf8');
  fs.writeFileSync(path.join(runtimeGov, 'BUGS-resolved.md'), '# BUGS-resolved\n', 'utf8');
  fs.writeFileSync(path.join(runtimeGov, 'CHANGELOG.md'), '# CHANGELOG\n', 'utf8');
  fs.writeFileSync(path.join(runtimeGov, 'projecttracking.md'), [
    '# projecttracking.md',
    '**Current Version:** 0.1.00',
    '**Next Task:** v0.1.01',
    '## Active Tasks',
    '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
    '|---|---|---|---|---|---|---|---|---|---|',
    '| v0.1.01 | docs | Bootstrap governance ledger | READY | unassigned | - | 2026-03-24 | - | - | bootstrap |',
    '',
    '---',
    '',
    '## Recently Completed',
    '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Last Backup SHA/File | Acceptance |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ].join('\n'), 'utf8');

  const { findGovernanceDir, readGovernanceSummary, parseTaskLedger, deriveNextTaskId, createTaskFromDraft } = loadGovernanceHelpers();
  const governanceDirSelected = findGovernanceDir(fixtureRoot);
  const summary = readGovernanceSummary(fixtureRoot);
  const ledger = parseTaskLedger(fixtureRoot);
  const derived = deriveNextTaskId(fixtureRoot, '0.3');
  const created = createTaskFromDraft(fixtureRoot, {
    lane: '0.3',
    title: 'Fresh runtime-created task',
    acceptance: 'Acceptance text',
  });

  const payload = {
    governanceDirSelected,
    nextTaskHeader: summary.nextTask,
    activeCount: ledger.active.length,
    recentCount: ledger.recent.length,
    derived,
    createdId: created.id,
    createdOwner: created.owner,
    createdStatus: created.status,
  };
  const rows = [
    { label: 'Governance dir', actual: payload.governanceDirSelected, expected: governanceDir },
    { label: 'Next task header', actual: payload.nextTaskHeader, expected: 'v0.3.24' },
    { label: 'Active task count', actual: String(payload.activeCount), expected: '0' },
    { label: 'Recent task count', actual: String(payload.recentCount), expected: '3' },
    { label: 'Next 0.3.x task id', actual: payload.derived, expected: 'v0.3.24' },
    { label: 'Created task id', actual: payload.createdId, expected: 'v0.3.24' },
    { label: 'Created owner', actual: payload.createdOwner, expected: 'unassigned' },
    { label: 'Created status', actual: payload.createdStatus, expected: 'READY' },
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

  console.log('PASS  test-tui-governance-task-creation.js');
} catch (error) {
  console.error('FAIL  test-tui-governance-task-creation.js');
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
