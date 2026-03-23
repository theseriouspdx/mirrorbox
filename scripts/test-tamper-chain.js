'use strict';

/**
 * test-tamper-chain.js
 *
 * Verifies that the hash chain validation (scripts/verify-chain.js)
 * correctly identifies payload mutations and chain breaches.
 */

const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
console.log('── Environment OK — proceeding with tamper-chain test ────────────\n');

const tamperDbPath = path.join(
  process.env.MBO_PROJECT_ROOT || process.cwd(),
  '.mbo', 'tamper-test.db'
);

const results = [];
function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

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
      run_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, event_id TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO events (id, seq, timestamp, stage, actor, payload, hash, world_id, parent_event_id, prev_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAnchor = db.prepare(`
    INSERT OR REPLACE INTO chain_anchors (run_id, seq, event_id, hash, created_at) VALUES (?, ?, ?, ?, ?)
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
      id, seq, stage, actor, timestamp, world_id,
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

async function main() {
  console.log('--- scripts/test-tamper-chain.js — Hash Chain Security Validation ---\n');

  if (fs.existsSync(tamperDbPath)) fs.unlinkSync(tamperDbPath);
  const seedDb = new Database(tamperDbPath);
  buildChain(seedDb, 5);
  seedDb.close();

  // Test 1: mutate payload
  console.log('Phase 1: Payload Mutation');
  const db1 = new Database(tamperDbPath);
  db1.prepare("UPDATE events SET payload = '{\"tampered\": true}' WHERE seq = 2").run();
  db1.close();

  try {
    execSync(`node scripts/verify-chain.js ${tamperDbPath}`, { stdio: 'pipe' });
    record('Catch payload tamper', false);
  } catch (_) {
    record('Catch payload tamper', true);
  }

  // Test 2: Fix hash but leave chain broken
  console.log('\nPhase 2: Partial Chain Fix (Broken Link)');
  const db2 = new Database(tamperDbPath);
  const ev2 = db2.prepare("SELECT * FROM events WHERE seq = 2").get();
  const env2 = JSON.stringify({
    id: ev2.id, seq: ev2.seq, stage: ev2.stage, actor: ev2.actor, timestamp: ev2.timestamp,
    world_id: ev2.world_id, parent_event_id: ev2.parent_event_id, prev_hash: ev2.prev_hash,
    payload: ev2.payload
  });
  db2.prepare("UPDATE events SET hash = ? WHERE seq = 2").run(crypto.createHash('sha256').update(env2).digest('hex'));
  db2.close();

  try {
    execSync(`node scripts/verify-chain.js ${tamperDbPath}`, { stdio: 'pipe' });
    record('Catch chain breach (broken prev_hash link)', false);
  } catch (_) {
    record('Catch chain breach (broken prev_hash link)', true);
  }

  if (fs.existsSync(tamperDbPath)) fs.unlinkSync(tamperDbPath);

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Hash Chain Tamper Summary Table ──────────────────────────────');
  console.log('| Security Check                                 | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-tamper-chain.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
