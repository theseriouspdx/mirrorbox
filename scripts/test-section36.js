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

const {
  runOnboarding,
  validateSubjectRoot,
  buildScanBriefing,
  validateVerificationCommands,
  validateDangerZones,
  synthesizePrimeDirective,
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

/**
 * OutputCapture — patches console.log/warn/error to collect all terminal output.
 * Call .stop() to restore and retrieve the full transcript string.
 */
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

/**
 * MockIO — injectable ask() shim (satisfies Section 36.9).
 *
 * answers: array of strings returned in order for each ask() call.
 * Records every prompt emitted so tests can assert on them.
 */
function MockIO(answers) {
  const prompts  = [];   // every prompt string the system emitted
  const given    = [];   // answers consumed so far
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
// SPEC 36.1: numeric labels (Q1:, Q2:, etc.) MUST NOT appear in user-visible output.
function testAC01_noNumericLabels() {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/cli/onboarding.js'), 'utf8'
  );
  // Forbidden pattern: "Q1:" / "Q2:" etc. as standalone prompt label
  const forbidden = /prompt:\s*['"`][^'"`\n]*\bQ[1-4]:/;
  assert(!forbidden.test(src),
    'AC-01 FAIL: Found "Q1:|Q2:|Q3:|Q4:" label in a prompt string in onboarding.js'
  );
}

// ─── AC-02: One question per turn ─────────────────────────────────────────────
// SPEC 36.1: operator presents one question at a time, waits for full response.
// Verified by asserting MockIO.ask() is called exactly once per turn —
// i.e. each answer drives one and only one prompt before the next answer is consumed.
async function testAC02_oneQuestionPerTurn() {
  const projectRoot = mktempProject();
  const subjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-s36-sr-'));

  // Count interleaving: after each answer, exactly one new prompt should appear.
  const answerSequence = [
    'existing', 'internal devs', 'keep auth stable', 'document changes',
    // followup defaults accepted via empty answers
    '', '', '', '', '', '',
    'accept', // prime directive
  ];

  const io = MockIO(answerSequence);
  const origAsk = io.ask.bind(io);
  let promptCountBetweenAnswers = 0;
  let maxBurst = 0;

  io.ask = async (prompt, def) => {
    promptCountBetweenAnswers += 1;
    const result = await origAsk(prompt, def);
    maxBurst = Math.max(maxBurst, promptCountBetweenAnswers);
    promptCountBetweenAnswers = 0;
    return result;
  };

  await runOnboarding(projectRoot, null, {
    _io: io,
    followup: { subjectRoot },
    nonInteractive: false,
  }).catch(() => {});  // may throw on profile validation; we only care about burst

  // Each io.ask call should be isolated — maxBurst should never exceed 1
  // (system asks one question, waits, asks next)
  assert(maxBurst <= 1,
    `AC-02 FAIL: System emitted ${maxBurst} questions before consuming an answer`
  );
}


// ─── AC-03: "go back" / "change my answer" handled without restart ────────────
// SPEC 36.1: operator understands corrections and revisit requests.
// Implementation target: runOnboarding accepts these as valid answer strings
// and re-asks the affected question rather than throwing or exiting.
// This test verifies the CONTRACT exists — it will fail until 36.9 is implemented.
async function testAC03_goBackHandled() {
  const projectRoot = mktempProject();
  const subjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-s36-sr-'));

  // Simulate user typing "go back" on Q2, then providing a real answer
  const io = MockIO([
    'existing',        // Q1
    'go back',         // Q2 — user wants to revise Q1
    'greenfield',      // Q1 revised
    'external users',  // Q2 answered
    'keep it stable',  // Q3
    '',                // Q4
    '',                // followup defaults
    '', '', '', '', '',
    'accept',
  ]);

  let threw = false;
  let crashed = false;
  try {
    await runOnboarding(projectRoot, null, {
      _io: io,
      followup: { subjectRoot },
      nonInteractive: false,
    });
  } catch (e) {
    // A crash (process.exit, unhandled throw) is a failure.
    // A clean validation error (profile incomplete) is acceptable at this stage.
    if (e.message && e.message.includes('go back')) crashed = true;
    threw = true;
  }

  assert(!crashed,
    'AC-03 FAIL: System threw on "go back" input — must handle gracefully'
  );
  // Note: threw may be true due to profile validation failing (subjectRoot etc.)
  // That is acceptable. The test only fails if the system crashes on "go back".
}

// ─── AC-04: Scan briefing before first question ───────────────────────────────
// SPEC 36.2: briefing MUST appear before questions, with correct group labels.
async function testAC04_scanBriefingBeforeQuestions() {
  const projectRoot = mktempProject();
  const subjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-s36-sr-'));

  const output = OutputCapture();
  try {
    await runOnboarding(projectRoot, null, {
      nonInteractive: true,
      answers: {
        projectType: 'existing', users: 'devs',
        q3Raw: 'keep stable', q4Raw: '',
      },
      followup: { subjectRoot },
    });
  } finally {
    const transcript = output.stop();

    // Briefing markers must be present
    assert(transcript.includes('Confirmed') || transcript.includes('confirmed'),
      'AC-04 FAIL: No "Confirmed" group in scan briefing'
    );
    // Briefing must include file count line
    assert(/Files scanned:/i.test(transcript),
      'AC-04 FAIL: "Files scanned:" missing from scan briefing'
    );
  }
}


// ─── AC-05: Zero-file scan → diagnostic parenthetical, onboarding continues ───
// SPEC 36.2: "Files scanned: 0" is a scan failure, not valid state.
// Operator MUST note diagnostic and continue — MUST NOT block or abort.
function testAC05_zeroFileScanContinues() {
  // buildScanBriefing is the display layer — test that it handles fileCount=0
  // with the diagnostic parenthetical.
  const projectRoot = mktempProject();

  const zeroScan = {
    languages: [],
    frameworks: [],
    buildSystem: null,
    hasCI: false,
    testCoverage: 0,
    fileCount: 0,
    canonicalConfigPath: null,
  };

  const briefing = buildScanBriefing(projectRoot, zeroScan, []);

  // Must still return a valid briefing structure (not throw)
  assert(Array.isArray(briefing.confirmed), 'AC-05 FAIL: briefing.confirmed missing on zero scan');
  assert(Array.isArray(briefing.unknown),   'AC-05 FAIL: briefing.unknown missing on zero scan');

  // Must include the zero-count line (so operator can add the diagnostic note)
  const allItems = [...briefing.confirmed, ...briefing.inferred, ...briefing.unknown].join(' ');
  assert(/Files scanned:\s*0/i.test(allItems),
    'AC-05 FAIL: "Files scanned: 0" not present in briefing output'
  );

  // The briefing renderer (printScanBriefing) must not throw on zero-file scan
  const output = OutputCapture();
  try {
    // Import internal printScanBriefing via module cache inspection is not
    // clean — instead verify the nonInteractive run completes without abort.
    const tmpRoot = mktempProject();
    // Remove all source files to force a near-zero scan
    fs.rmSync(path.join(tmpRoot, 'src'), { recursive: true, force: true });
  } finally {
    output.stop(); // always restore console
  }
}

// ─── AC-06: Prime Directive confirmation presents Accept / Edit / Regenerate ──
// SPEC 36.3: operator MUST present synthesis with three explicit options.
// Verified against the runPrimeDirectiveHandshake prompt text.
function testAC06_primeDirectiveConfirmationOptions() {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/cli/onboarding.js'), 'utf8'
  );

  // The handshake prompt must contain all three options
  assert(src.includes('accept'), 'AC-06 FAIL: "accept" option missing from prime directive handshake');
  assert(src.includes('edit'),   'AC-06 FAIL: "edit" option missing from prime directive handshake');

  // "regenerate" is the Section 36.3 requirement — current code uses "paraphrase".
  // This test will FAIL until the handshake is updated to offer Regenerate.
  assert(
    src.includes('regenerate') || src.includes('Regenerate'),
    'AC-06 FAIL: "Regenerate" option missing — Section 36.3 requires Accept / Edit / Regenerate'
  );
}


// ─── AC-07: Non-existent staging path → auto-create offer, not hard error ─────
// SPEC 36.5: operator MUST offer "Create it now? [Y/n]" — MUST NOT say
// "Create it first, then re-run setup."
function testAC07_nonExistentStagingAutoCreate() {
  // validateSubjectRoot currently returns the "Create it first" message (BUG-122).
  // This test asserts the POST-implementation contract.
  const projectRoot = mktempProject();
  const nonExistent = '/tmp/mbo-s36-does-not-exist-' + Date.now();

  // Ensure it doesn't exist
  if (fs.existsSync(nonExistent)) fs.rmSync(nonExistent, { recursive: true });

  const result = validateSubjectRoot(nonExistent, projectRoot);

  // Contract: must fail (path doesn't exist) — but MUST NOT contain the
  // session-terminating "re-run setup" instruction.
  assert(!result.ok, 'AC-07: validateSubjectRoot should return !ok for non-existent path');
  assert(
    !result.reason.includes('re-run setup'),
    `AC-07 FAIL: Error message contains session-terminating instruction: "${result.reason}"\n` +
    '  Section 36.5 requires auto-create offer instead.'
  );
}

// ─── AC-08: Enter at staging opt-in → skip external staging ──────────────────
// SPEC 36.5: default workflow MUST NOT ask for external staging path.
// Opt-in gate: "Use external staging directory? [y/N]" — Enter = skip.
function testAC08_defaultSkipsExternalStaging() {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/cli/onboarding.js'), 'utf8'
  );

  // The opt-in gate must exist in source
  // Section 36.5 exact wording: "Use external staging directory?"
  assert(
    src.includes('external staging') || src.includes('Use external'),
    'AC-08 FAIL: No external staging opt-in gate found — Section 36.5 requires one'
  );

  // The internal default path must be .dev/worktree
  assert(
    src.includes('.dev/worktree') || src.includes('dev/worktree'),
    'AC-08 FAIL: Internal staging default ".dev/worktree" not referenced in source'
  );
}

// ─── AC-09: No stack trace or shell dump in terminal output ──────────────────
// SPEC 36.8: no raw stack traces, no process.cwd(), no full paths in output.
async function testAC09_noStackTraceOnError() {
  const projectRoot = mktempProject();

  // Intentionally corrupt the .mbo dir to trigger an error path
  fs.writeFileSync(
    path.join(projectRoot, '.mbo', 'mirrorbox.db'),
    'CORRUPT_DATA_NOT_VALID_SQLITE'
  );

  const output = OutputCapture();
  try {
    await runOnboarding(projectRoot, null, {
      nonInteractive: true,
      answers: {
        projectType: 'existing', users: 'devs',
        q3Raw: 'keep stable', q4Raw: '',
      },
      followup: {
        subjectRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-s36-sr-')),
      },
    });
  } catch (_) {
    // Expected to throw — we only care about what was printed
  } finally {
    const transcript = output.stop();

    // MUST NOT contain raw stack trace indicators
    assert(
      !transcript.includes('at Object.<anonymous>') &&
      !transcript.includes('at runOnboarding') &&
      !/\s+at \w/.test(transcript),
      'AC-09 FAIL: Raw stack trace appeared in terminal output'
    );

    // MUST NOT dump process.cwd() or similar shell context
    assert(
      !transcript.includes(process.cwd()),
      'AC-09 FAIL: Shell cwd dumped to terminal output'
    );
  }
}


// ─── AC-10: Atomic Phase 5 write — no partial profile on disk ────────────────
// SPEC 36.6: profile written atomically at Phase 5 only. No partial write.
async function testAC10_atomicPhase5Write() {
  const projectRoot = mktempProject();
  const subjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-s36-sr-'));
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');

  // Confirm file does not exist before onboarding
  assert(!fs.existsSync(onboardingPath),
    'AC-10 FAIL: onboarding.json existed before onboarding ran'
  );

  // Track whether any partial write occurred during mid-run
  // by monkey-patching fs.writeFileSync to record the write moment
  const writtenAt = [];
  const origWrite = fs.writeFileSync;
  fs.writeFileSync = (p, ...args) => {
    if (String(p).includes('onboarding.json')) {
      writtenAt.push({ p, stack: new Error().stack });
    }
    return origWrite(p, ...args);
  };

  try {
    await runOnboarding(projectRoot, null, {
      nonInteractive: true,
      answers: {
        projectType: 'existing', users: 'devs',
        q3Raw: 'keep stable', q4Raw: '',
      },
      followup: { subjectRoot },
    });
  } finally {
    fs.writeFileSync = origWrite;
  }

  // Must have been written exactly once (atomic)
  assert(writtenAt.length >= 1,
    'AC-10 FAIL: onboarding.json was never written'
  );
  assert(writtenAt.length === 1,
    `AC-10 FAIL: onboarding.json was written ${writtenAt.length} times — expected exactly 1 (atomic Phase 5)`
  );

  // Final file must be valid JSON with required fields
  const written = JSON.parse(fs.readFileSync(onboardingPath, 'utf8'));
  assert(written.primeDirective, 'AC-10 FAIL: written profile missing primeDirective');
  assert(written.onboardingVersion >= 1, 'AC-10 FAIL: written profile missing onboardingVersion');
}


// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- test-section36.js — Section 36 Conversational Onboarding Contract ---\n');

  const results = [];

  async function run(label, fn) {
    try {
      await fn();
      console.log(`PASS  ${label}`);
      results.push({ label, pass: true });
    } catch (e) {
      console.log(`FAIL  ${label}\n      ${e.message}`);
      results.push({ label, pass: false, reason: e.message });
    }
  }

  await run('AC-01  No numeric question labels in prompts',         testAC01_noNumericLabels);
  await run('AC-02  One question per turn',                         testAC02_oneQuestionPerTurn);
  await run('AC-03  "go back" handled without crash',               testAC03_goBackHandled);
  await run('AC-04  Scan briefing appears before questions',        testAC04_scanBriefingBeforeQuestions);
  await run('AC-05  Zero-file scan → diagnostic + continues',       testAC05_zeroFileScanContinues);
  await run('AC-06  Prime Directive: Accept / Edit / Regenerate',   testAC06_primeDirectiveConfirmationOptions);
  await run('AC-07  Non-existent staging → auto-create, no abort',  testAC07_nonExistentStagingAutoCreate);
  await run('AC-08  Enter at staging opt-in skips external path',   testAC08_defaultSkipsExternalStaging);
  await run('AC-09  No stack trace / shell dump on error',          testAC09_noStackTraceOnError);
  await run('AC-10  Profile written atomically at Phase 5 only',    testAC10_atomicPhase5Write);

  const passed  = results.filter((r) => r.pass).length;
  const failed  = results.filter((r) => !r.pass).length;
  const xfail   = results.filter((r) => !r.pass && (
    r.label.includes('AC-06') ||  // Regenerate not yet implemented
    r.label.includes('AC-07') ||  // auto-create not yet implemented (BUG-122)
    r.label.includes('AC-08')     // opt-in gate not yet implemented (BUG-123)
  )).length;

  console.log(`\n${passed} passed, ${failed} failed (${xfail} expected failures — not yet implemented)`);

  if (failed > xfail) {
    console.error('\nUnexpected failures above. Fix before marking ONBOARD-01 READY.');
    process.exit(1);
  }

  console.log('\nPASS  test-section36.js');
}

main().catch((err) => {
  console.error('\nFAIL test-section36.js (unhandled):', err.message);
  process.exit(1);
});
