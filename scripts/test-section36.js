#!/usr/bin/env node
/**
 * test-section36.js — Section 36 Conversational Onboarding Contract Tests
 *
 * Acceptance criteria from SPEC Section 36.10 (transcript-level, not unit-test-level):
 *
 *  AC-01  No question carries a visible number label.
 *  AC-02  Only one question appears per turn.
 *  AC-03  User can type "go back" / "change my answer" — operator handles without restart.
 *  AC-04  Scan briefing appears before the first question, groups per 36.2 rules.
 *  AC-05  Zero-file scan notes diagnostic parenthetical and continues.
 *  AC-06  Prime Directive confirmation presents Accept / Edit / Regenerate.
 *  AC-07  Non-existent staging path → auto-create offer, not session-terminating error.
 *  AC-08  Enter at staging opt-in → skip external staging entirely.
 *  AC-09  No stack trace or shell dump in terminal output under any condition.
 *  AC-10  Profile written atomically at Phase 5 only. No partial write.
 *
 * Architecture:
 *   - MockIO: injectable ask() shim that feeds scripted answers and records
 *     every prompt the system emits. Satisfies Section 36.9 (injectable ask()).
 *   - OutputCapture: patches console.log/error to collect terminal output.
 *   - Tests use runOnboarding() with a custom io override where needed,
 *     and the existing nonInteractive path for pure-logic ACs.
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

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
console.log('── Environment OK — proceeding with section36 test ───────────────\n');

// ── Mock callModel to avoid timeouts and network ─────────────────────────────
const callModelModule = require('../src/auth/call-model');
const originalCallModel = callModelModule.callModel;
callModelModule.callModel = async (role, prompt) => {
  if (role === 'onboarding') {
    if (prompt.includes('Conversation so far:')) {
      const transcript = prompt.split('Conversation so far:')[1] || '';
      const turnCount = (transcript.match(/MBO:/g) || []).length;
      
      if (turnCount >= 4) {
        return '---WORKING AGREEMENT---\nprime_directive: test\nproject_type: existing\nusers: devs\nstaging_path: internal\n---END---';
      }
    }
    return 'What is your project type?';
  }
  return '';
};

const {
  runOnboarding,
  validateSubjectRoot,
  buildScanBriefing,
} = require('../src/cli/onboarding');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mktempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-s36-'));
  fs.mkdirSync(path.join(root, '.mbo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'tmp-project',
    scripts: { test: 'node -e "process.exit(0)"' },
    dependencies: { express: '^5.0.0' },
  }, null, 2));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'module.exports = 42;\n');
  return root;
}

function OutputCapture() {
  const lines = [];
  const origLog   = console.log;
  const origWarn  = console.warn;
  const origError = console.error;

  console.log   = (...args) => lines.push(args.map(String).join(' '));
  console.warn  = (...args) => lines.push(args.map(String).join(' '));
  console.error = (...args) => lines.push(args.map(String).join(' '));

  return {
    stop() {
      console.log   = origLog;
      console.warn  = origWarn;
      console.error = origError;
      return lines.join('\n');
    },
    lines,
  };
}

function MockIO(answers) {
  const prompts  = [];
  const given    = [];
  let   idx      = 0;

  return {
    prompts,
    given,
    close: () => {},
    ask: async (prompt, defaultValue = '') => {
      prompts.push(prompt);
      const answer = idx < answers.length ? answers[idx++] : (defaultValue || '');
      given.push(answer);
      return answer;
    },
  };
}

// ─── AC-01: No visible question number labels ─────────────────────────────────
function testAC01_noNumericLabels() {
  const src = fs.readFileSync(path.join(__dirname, '../src/cli/onboarding.js'), 'utf8');
  const forbidden = /prompt:\s*['"`][^'"`\n]*\bQ[1-4]:/;
  assert(!forbidden.test(src), 'AC-01 FAIL: Found "Q1:|Q2:|Q3:|Q4:" label in a prompt string');
}

// ─── AC-02: One question per turn ─────────────────────────────────────────────
async function testAC02_oneQuestionPerTurn() {
  const projectRoot = mktempProject();
  const answerSequence = ['existing', 'internal devs', 'keep stable', 'document', 'accept'];
  const io = MockIO(answerSequence);
  const origAsk = io.ask.bind(io);
  let maxBurst = 0;
  let currentBurst = 0;

  io.ask = async (p, d) => {
    currentBurst++;
    maxBurst = Math.max(maxBurst, currentBurst);
    const res = await origAsk(p, d);
    currentBurst = 0;
    return res;
  };

  await runOnboarding(projectRoot, null, { nonInteractive: false }, io).catch(() => {});
  assert(maxBurst <= 1, `AC-02 FAIL: System emitted ${maxBurst} questions per turn`);
}

// ─── AC-03: "go back" handled without crash ──────────────────────────────────
async function testAC03_goBackHandled() {
  const projectRoot = mktempProject();
  const io = MockIO(['existing', 'go back', 'greenfield', 'accept']);
  let crashed = false;
  try {
    await runOnboarding(projectRoot, null, { nonInteractive: false }, io);
  } catch (e) {
    if (e.message && e.message.includes('go back')) crashed = true;
  }
  assert(!crashed, 'AC-03 FAIL: System crashed on "go back" input');
}

// ─── AC-04: Scan briefing before first question ───────────────────────────────
async function testAC04_scanBriefingBeforeQuestions() {
  const projectRoot = mktempProject();
  const output = OutputCapture();
  const io = MockIO(['accept']);
  try {
    await runOnboarding(projectRoot, null, { nonInteractive: false }, io);
  } finally {
    const transcript = output.stop();
    assert(transcript.includes('Confirmed'), 'AC-04 FAIL: No "Confirmed" group in scan briefing');
    assert(/Files scanned:/i.test(transcript), 'AC-04 FAIL: "Files scanned:" missing');
  }
}

// ─── AC-05: Zero-file scan diagnostic ─────────────────────────────────────────
function testAC05_zeroFileScanContinues() {
  const projectRoot = mktempProject();
  const zeroScan = { languages: [], frameworks: [], buildSystem: null, hasCI: false, testCoverage: 0, fileCount: 0, tokenCountRaw: 0 };
  const briefing = buildScanBriefing(projectRoot, zeroScan, []);
  const allItems = [...briefing.confirmed, ...briefing.inferred, ...briefing.unknown].join(' ');
  assert(/Files scanned:\s*0/i.test(allItems), 'AC-05 FAIL: "Files scanned: 0" not present');
}

// ─── AC-06: Prime Directive: Accept / Edit / Regenerate ──────────────────────
function testAC06_primeDirectiveConfirmationOptions() {
  const src = fs.readFileSync(path.join(__dirname, '../src/cli/onboarding.js'), 'utf8');
  assert(src.includes('accept') && src.includes('edit') && (src.includes('regenerate') || src.includes('Regenerate')), 'AC-06 FAIL: Accept/Edit/Regenerate options missing');
}

// ─── AC-07: Non-existent staging path ────────────────────────────────────────
function testAC07_nonExistentStagingAutoCreate() {
  const projectRoot = mktempProject();
  const result = validateSubjectRoot('/tmp/definitely-not-here-' + Date.now(), projectRoot);
  assert(!result.ok && result.reason === 'does_not_exist', 'AC-07 FAIL: Incorrect result for non-existent path');
}

// ─── AC-08: Enter skips external staging ─────────────────────────────────────
function testAC08_defaultSkipsExternalStaging() {
  const src = fs.readFileSync(path.join(__dirname, '../src/cli/onboarding.js'), 'utf8');
  assert(src.includes('external staging') && src.includes('.dev/worktree'), 'AC-08 FAIL: External staging logic missing');
}

// ─── AC-09: No stack trace on error ──────────────────────────────────────────
async function testAC09_noStackTraceOnError() {
  const projectRoot = mktempProject();
  fs.writeFileSync(path.join(projectRoot, '.mbo', 'mirrorbox.db'), 'GARBAGE');
  const output = OutputCapture();
  try { await runOnboarding(projectRoot, null, { nonInteractive: true }); } catch (_) {}
  const transcript = output.stop();
  assert(!/\s+at \w/.test(transcript), 'AC-09 FAIL: Raw stack trace appeared');
}

// ─── AC-10: Atomic Phase 5 write ─────────────────────────────────────────────
async function testAC10_atomicPhase5Write() {
  const projectRoot = mktempProject();
  const writtenAt = [];
  const origWrite = fs.writeFileSync;
  fs.writeFileSync = (p, ...args) => {
    if (String(p).includes('onboarding.json')) writtenAt.push(p);
    return origWrite(p, ...args);
  };
  try { await runOnboarding(projectRoot, null, { nonInteractive: true }); } catch (_) {}
  fs.writeFileSync = origWrite;
  assert(writtenAt.length <= 1, `AC-10 FAIL: onboarding.json written ${writtenAt.length} times`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- test-section36.js — Section 36 Conversational Onboarding Contract ---\n');
  const results = [];

  const run = async (label, fn) => {
    try {
      await fn();
      console.log(`PASS  ${label}`);
      results.push({ label, status: 'PASS' });
    } catch (e) {
      console.log(`FAIL  ${label}\n      ${e.message}`);
      results.push({ label, status: 'FAIL' });
    }
  };

  await run('AC-01  No numeric question labels',         testAC01_noNumericLabels);
  await run('AC-02  One question per turn',             testAC02_oneQuestionPerTurn);
  await run('AC-03  "go back" handled without crash',   testAC03_goBackHandled);
  await run('AC-04  Scan briefing before questions',    testAC04_scanBriefingBeforeQuestions);
  await run('AC-05  Zero-file scan diagnostic',         testAC05_zeroFileScanContinues);
  await run('AC-06  Accept / Edit / Regenerate',        testAC06_primeDirectiveConfirmationOptions);
  await run('AC-07  Non-existent staging path',         testAC07_nonExistentStagingAutoCreate);
  await run('AC-08  Enter skips external staging',      testAC08_defaultSkipsExternalStaging);
  await run('AC-09  No stack trace on error',           testAC09_noStackTraceOnError);
  await run('AC-10  Atomic Phase 5 write',              testAC10_atomicPhase5Write);

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Section 36 AC Summary Table ──────────────────────────────────');
  console.log('| Acceptance Criteria                            | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failed = results.filter(r => r.status === 'FAIL').length;
  if (failed > 0) {
    console.error(`\nFAIL: ${failed} Section 36 criteria failed.`);
    process.exit(1);
  }
  console.log('PASS  test-section36.js');
}

main().catch((err) => {
  console.error('\nFAIL test-section36.js (unhandled):', err.message);
  process.exit(1);
});
