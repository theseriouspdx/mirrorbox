'use strict';

/**
 * test-chain.js
 *
 * Verifies the hash chain integrity and tamper detection by mutating a test database.
 */

const Database = require('better-sqlite3');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

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
console.log('── Environment OK — proceeding with chain integrity test ─────────\n');

const DB_PATH = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db');
const TEST_DB_PATH = path.join(path.dirname(DB_PATH), 'mirrorbox_test_tamper_legacy.db');

const results = [];
function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

function runVerify(dbPath) {
  try {
    execSync(`node scripts/verify-chain.js ${dbPath}`, { stdio: 'pipe' });
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log('--- scripts/test-chain.js — Hash Chain Tamper Validation ---\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('FAIL: mirrorbox.db not found. Run test-state.js first.');
    process.exit(1);
  }

  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  fs.copyFileSync(DB_PATH, TEST_DB_PATH);

  const db = new Database(TEST_DB_PATH);
  const events = db.prepare('SELECT * FROM events ORDER BY seq ASC').all();
  
  if (events.length < 2) {
    console.error('FAIL: Need at least 2 events to test chain.');
    db.close();
    fs.unlinkSync(TEST_DB_PATH);
    process.exit(1);
  }

  const event1 = events[0];
  const eventTail = events[events.length - 1];

  // Test 1: Verify chain passes normally
  record('Chain passes normally on clean copy', runVerify(TEST_DB_PATH));

  // Test 2: Payload tamper detected
  db.prepare('UPDATE events SET payload = ? WHERE seq = ?').run('{"tampered":true}', event1.seq);
  record('Chain fails on payload tamper', runVerify(TEST_DB_PATH) === false);
  db.prepare('UPDATE events SET payload = ? WHERE seq = ?').run(event1.payload, event1.seq);

  // Test 3: Actor tamper detected
  db.prepare('UPDATE events SET actor = ? WHERE seq = ?').run('TAMPER', event1.seq);
  record('Chain fails on actor tamper', runVerify(TEST_DB_PATH) === false);
  db.prepare('UPDATE events SET actor = ? WHERE seq = ?').run(event1.actor, event1.seq);

  // Test 4: Anchor mismatch detected
  const lastAnchor = db.prepare('SELECT run_id FROM chain_anchors ORDER BY created_at DESC LIMIT 1').get();
  if (lastAnchor) {
    db.prepare('UPDATE chain_anchors SET hash = ? WHERE run_id = ?').run('badhash', lastAnchor.run_id);
    record('Chain fails on anchor mismatch', runVerify(TEST_DB_PATH) === false);
  }

  // Test 5: Event deletion detected (Tail Deletion)
  db.prepare('DELETE FROM events WHERE seq = ?').run(eventTail.seq);
  record('Chain fails on tail event deletion', runVerify(TEST_DB_PATH) === false);

  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Chain Integrity Summary Table ────────────────────────────────');
  console.log('| Tamper Scenario                                | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-chain.js');
}

main().catch(console.error);
