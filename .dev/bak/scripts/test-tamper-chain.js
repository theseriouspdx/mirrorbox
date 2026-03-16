const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const tamperDbPath = path.join(
  process.env.MBO_PROJECT_ROOT || process.cwd(),
  '.mbo', 'tamper-test.db'
);

console.log('--- Testing Hash Chain Tamper Proofing ---');

// ───────────────────────────────────────────────
// Seed a self-contained synthetic chain
// (never depends on the real mirrorbox.db state)
// ───────────────────────────────────────────────
function buildChain(db, n) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL UNIQUE,
      timestamp INTEGER NOT NULL,
      stage TEXT NOT NULL,
      actor TEXT NOT NULL,
      payload TEXT NOT NULL,
      hash TEXT NOT NULL,
      world_id TEXT NOT NULL,
      parent_event_id TEXT,
      prev_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS chain_anchors (
      run_id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO events (id, seq, timestamp, stage, actor, payload, hash, world_id, parent_event_id, prev_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAnchor = db.prepare(`
    INSERT OR REPLACE INTO chain_anchors (run_id, seq, event_id, hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const runId = crypto.randomUUID();

  let prevId = null;
  let prevHash = null;

  for (let i = 1; i <= n; i++) {
    const id = crypto.randomUUID();
    const seq = i;
    const timestamp = Date.now() + i;
    const stage = 'test';
    const actor = 'test-seeder';
    const payload = JSON.stringify({ index: i });
    const world_id = 'mirror';

    const envelope = JSON.stringify({
      id, seq, stage, actor, timestamp,
      world_id,
      parent_event_id: prevId ?? null,
      prev_hash: prevHash ?? null,
      payload
    });
    const hash = crypto.createHash('sha256').update(envelope).digest('hex');

    insert.run(id, seq, timestamp, stage, actor, payload, hash, world_id, prevId, prevHash);
    insertAnchor.run(runId, seq, id, hash, timestamp);

    prevId = id;
    prevHash = hash;
  }
}

if (fs.existsSync(tamperDbPath)) fs.unlinkSync(tamperDbPath);

// Seed 5 events into a fresh test DB
const seedDb = new Database(tamperDbPath);
buildChain(seedDb, 5);
seedDb.close();

// ─────────────────────────────────────────
// Test 1: mutate payload — hash must fail
// ─────────────────────────────────────────
console.log('\nMutating payload of seq 2...');
const db1 = new Database(tamperDbPath);
const result = db1.prepare("UPDATE events SET payload = '{\"tampered\": true}' WHERE seq = 2").run();
db1.close();

if (result.changes === 0) {
  console.error('FAIL [Setup]: UPDATE affected 0 rows — seq 2 not found in seeded chain.');
  process.exit(1);
}

console.log('Running verification on tampered DB (should fail):');
try {
  execSync(`node scripts/verify-chain.js ${tamperDbPath}`, { stdio: 'inherit' });
  console.error('\nFAIL: Verification passed on tampered database!');
  fs.unlinkSync(tamperDbPath);
  process.exit(1);
} catch (_) {
  console.log('\nSUCCESS: Verification caught the payload tamper.');
}

// ─────────────────────────────────────────────────────────
// Test 2: re-hash seq 2 to match new payload,
//         but leave seq 3's prev_hash pointing at old hash.
//         Chain breach must still be detected.
// ─────────────────────────────────────────────────────────
console.log('\nAttempting to "fix" seq 2 hash but leaving chain broken...');
const db2 = new Database(tamperDbPath);
const event2 = db2.prepare("SELECT * FROM events WHERE seq = 2").get();
const envelope2 = JSON.stringify({
  id: event2.id,
  seq: event2.seq,
  stage: event2.stage,
  actor: event2.actor,
  timestamp: event2.timestamp,
  world_id: event2.world_id,
  parent_event_id: event2.parent_event_id ?? null,
  prev_hash: event2.prev_hash ?? null,
  payload: event2.payload
});
const newHash2 = crypto.createHash('sha256').update(envelope2).digest('hex');
db2.prepare("UPDATE events SET hash = ? WHERE seq = 2").run(newHash2);
db2.close();

console.log('Running verification on partially fixed DB (should still fail chain check):');
try {
  execSync(`node scripts/verify-chain.js ${tamperDbPath}`, { stdio: 'inherit' });
  console.error('\nFAIL: Verification passed on chain-broken database!');
  fs.unlinkSync(tamperDbPath);
  process.exit(1);
} catch (_) {
  console.log('\nSUCCESS: Verification caught the chain breach.');
}

fs.unlinkSync(tamperDbPath);
console.log('\n--- Hash Chain Tamper Proofing Test PASSED ---');
