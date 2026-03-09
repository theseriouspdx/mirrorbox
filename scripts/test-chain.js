const Database = require('better-sqlite3');
const assert = require('assert');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/mirrorbox.db');
const TEST_DB_PATH = path.join(__dirname, '../data/mirrorbox_test_tamper.db');

function runVerify(dbPath) {
  try {
    execSync(`node scripts/verify-chain.js ${dbPath}`, { stdio: 'pipe' });
    return true;
  } catch (err) {
    return false;
  }
}

function testChain() {
  console.log('--- Testing Chain Integrity and Tamper Detection ---');

  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  fs.copyFileSync(DB_PATH, TEST_DB_PATH);

  const db = new Database(TEST_DB_PATH);

  const events = db.prepare('SELECT * FROM events ORDER BY seq ASC').all();
  if (events.length < 2) {
    console.error('Need at least 2 events to test chain. Run test-state.js first.');
    process.exit(1);
  }

  const event1 = events[0];
  const eventTail = events[events.length - 1];

  // Test 1: Verify chain passes normally
  assert.strictEqual(runVerify(TEST_DB_PATH), true, 'Chain should pass normally');

  // Test 2: Payload tamper detected
  db.prepare('UPDATE events SET payload = ? WHERE seq = ?').run('{"tampered":true}', event1.seq);
  assert.strictEqual(runVerify(TEST_DB_PATH), false, 'Chain should fail on payload tamper');
  db.prepare('UPDATE events SET payload = ? WHERE seq = ?').run(event1.payload, event1.seq);

  // Test 3: Actor tamper detected
  db.prepare('UPDATE events SET actor = ? WHERE seq = ?').run('TAMPER', event1.seq);
  assert.strictEqual(runVerify(TEST_DB_PATH), false, 'Chain should fail on actor tamper');
  db.prepare('UPDATE events SET actor = ? WHERE seq = ?').run(event1.actor, event1.seq);

  // Test 4: Anchor mismatch detected
  db.prepare('UPDATE chain_anchors SET hash = ? WHERE id = 1').run('badhash');
  assert.strictEqual(runVerify(TEST_DB_PATH), false, 'Chain should fail on anchor mismatch');

  // Test 5: Event deletion detected (Tail Deletion)
  // Delete the tail event to test if the anchor mismatch catches it
  db.prepare('DELETE FROM events WHERE seq = ?').run(eventTail.seq);
  assert.strictEqual(runVerify(TEST_DB_PATH), false, 'Chain should fail on tail event deletion due to anchor mismatch');

  db.close();
  fs.unlinkSync(TEST_DB_PATH);

  console.log('PASS: All chain tamper tests passed.');
}

testChain();
