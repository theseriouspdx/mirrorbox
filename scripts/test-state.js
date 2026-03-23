'use strict';

const stateManager = require('../src/state/state-manager');
const eventStore = require('../src/state/event-store');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const assert = require('assert');

const DB_PATH = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db');

// ── Rule 1: Environment Assertions ───────────────────────────────────────────
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'MirrorBox DB exists', ok: fs.existsSync(DB_PATH), detail: `not found at ${DB_PATH}` }
];
let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
console.log('── Environment OK — proceeding with state test ───────────────────\n');

async function testState() {
  console.log('--- Testing Mirror Box State Management ---');

  const db = new Database(DB_PATH);

  // 1. Initial Snapshot
  const initialSummary = {
    currentTask: 'v0.11.186',
    currentStage: 'EXECUTION',
    activeModel: 'GEMINI-CLI',
    filesInScope: ['scripts/test-state.js'],
    recoveryAttempts: 0,
    progressSummary: 'Hardening state management tests.'
  };
  stateManager.snapshot(initialSummary, 'mirror');
  console.log('Step 1: Initial snapshot created.');

  // 2. Event with Secret (Testing Invariant 8)
  const secretPayload = {
    message: 'Simulating a model call with an API key.',
    apiKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890', // Mock OpenRouter key
    gitToken: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz'   // Mock GitHub token
  };
  eventStore.append('PLANNING', 'ORCHESTRATOR', secretPayload, 'mirror');
  console.log('Step 2: Secret payload appended.');

  // 2.5 Concurrent append test (Same Millisecond)
  console.log('Step 2.5: Testing concurrent appends (same millisecond)...');
  const DateNowOriginal = Date.now;
  const fixedTime = DateNowOriginal();
  Date.now = () => fixedTime;

  eventStore.append('CONCURRENT_1', 'ACTOR', { message: 'first' }, 'mirror');
  eventStore.append('CONCURRENT_2', 'ACTOR', { message: 'second' }, 'mirror');

  Date.now = DateNowOriginal; // restore

  const concurrentEvents = db.prepare("SELECT stage, seq FROM events WHERE stage LIKE 'CONCURRENT_%' ORDER BY seq ASC").all();
  assert.strictEqual(concurrentEvents[0].stage, 'CONCURRENT_1');
  assert.strictEqual(concurrentEvents[1].stage, 'CONCURRENT_2');
  console.log('PASS: Concurrent appends ordered deterministically by seq.');

  // 3. Final Snapshot
  const finalSummary = {
    ...initialSummary,
    currentStage: 'VALIDATION',
    progressSummary: 'State management hardening complete.'
  };
  stateManager.snapshot(finalSummary, 'mirror');
  console.log('Step 3: Final snapshot created.');

  // 4. Verification
  console.log('\n--- Running Chain Verification ---');
  const { execSync } = require('child_process');
  try {
    const output = execSync('node scripts/verify-chain.js').toString();
    console.log(output);
  } catch (error) {
    console.error('Chain verification failed!', error.stdout ? error.stdout.toString() : error.message);
    process.exit(1);
  }

  // 5. Check Redaction
  const secretEvents = db.prepare("SELECT payload FROM events WHERE actor = 'ORCHESTRATOR' AND stage = 'PLANNING' ORDER BY seq DESC LIMIT 1").all();
  const secretEvent = secretEvents[0];
  if (secretEvent && secretEvent.payload.includes('[REDACTED:')) {
    console.log('PASS: Secrets were successfully redacted in the database.');
  } else {
    console.error('FAIL: Secrets were NOT redacted!', secretEvent ? secretEvent.payload : 'No secret event found');
    process.exit(1);
  }

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  const stats = db.prepare("SELECT stage, count(*) as count FROM events GROUP BY stage").all();
  console.log('\n── State Summary Table ─────────────────────────────────────────');
  console.log('| Stage                | Count                                  |');
  console.log('| -------------------- | -------------------------------------- |');
  for (const row of stats) {
    console.log(`| ${row.stage.padEnd(20)} | ${row.count.toString().padEnd(38)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  db.close();
  console.log('--- State Management Validation Passed ---');
}

testState().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
