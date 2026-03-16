const stateManager = require('../src/state/state-manager');
const eventStore = require('../src/state/event-store');
const fs = require('fs');
const path = require('path');

async function testState() {
  console.log('--- Testing Mirror Box State Management ---');

  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '../data/mirrorbox.db'));

  // 1. Initial Snapshot
  const initialSummary = {
    currentTask: '0.3-01',
    currentStage: 'RESEARCH',
    activeModel: 'GEMINI-CLI',
    filesInScope: ['src/state/db-manager.js'],
    recoveryAttempts: 0,
    progressSummary: 'Initializing state management modules.'
  };
  stateManager.snapshot(initialSummary);
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
  const assert = require('assert');
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
    currentStage: 'EXECUTION',
    progressSummary: 'State management validation complete.'
  };
  stateManager.snapshot(finalSummary);
  console.log('Step 3: Final snapshot created.');

  // 4. Verification
  console.log('\n--- Running Chain Verification ---');
  const { execSync } = require('child_process');
  try {
    const output = execSync('node scripts/verify-chain.js').toString();
    console.log(output);
  } catch (error) {
    console.error('Chain verification failed!', error.stdout.toString());
    process.exit(1);
  }

  // 5. Check Redaction
  const secretEvent = db.prepare("SELECT payload FROM events WHERE actor = 'ORCHESTRATOR' AND stage = 'PLANNING'").get();
  if (secretEvent.payload.includes('[REDACTED:')) {
    console.log('PASS: Secrets were successfully redacted in the database.');
  } else {
    console.error('FAIL: Secrets were NOT redacted!', secretEvent.payload);
    process.exit(1);
  }

  console.log('--- State Management Validation Passed ---');
}

testState();
