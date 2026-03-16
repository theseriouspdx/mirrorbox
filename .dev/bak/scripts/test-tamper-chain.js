const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const origDbPath = path.join(__dirname, '../data/mirrorbox.db');
const tamperDbPath = path.join(__dirname, '../data/tamper.db');

console.log('--- Testing Hash Chain Tamper Proofing ---');

if (fs.existsSync(tamperDbPath)) fs.unlinkSync(tamperDbPath);
fs.copyFileSync(origDbPath, tamperDbPath);

const db = new Database(tamperDbPath);

// Mutate a middle event (e.g., seq 2)
// This should invalidate its own hash AND the chain of all subsequent events (seq 3, 4, 5)
console.log('Mutating payload of seq 2...');
db.prepare("UPDATE events SET payload = '{\"tampered\": true}' WHERE seq = 2").run();
db.close();

console.log('\nRunning verification on tampered DB (should fail):');
try {
  execSync(`node scripts/verify-chain.js ${tamperDbPath}`, { stdio: 'inherit' });
  console.error('\nFAIL: Verification passed on tampered database!');
  process.exit(1);
} catch (error) {
  console.log('\nSUCCESS: Verification caught the tampering.');
}

// Second test: Mutate hash of seq 2 to "match" new payload (internal integrity check)
// But don't update seq 3's prev_hash. This should still fail chain verification.
console.log('\nAttempting to "fix" seq 2 hash but leaving chain broken...');
const db2 = new Database(tamperDbPath);
const event2 = db2.prepare("SELECT * FROM events WHERE seq = 2").get();
const crypto = require('crypto');
const envelope = JSON.stringify({
  id: event2.id,
  seq: event2.seq,
  stage: event2.stage,
  actor: event2.actor,
  timestamp: event2.timestamp,
  parent_event_id: event2.parent_event_id,
  prev_hash: event2.prev_hash,
  payload: event2.payload
});
const newHash = crypto.createHash('sha256').update(envelope).digest('hex');
db2.prepare("UPDATE events SET hash = ? WHERE seq = 2").run(newHash);
db2.close();

console.log('\nRunning verification on partially fixed DB (should still fail chain check):');
try {
  execSync(`node scripts/verify-chain.js ${tamperDbPath}`, { stdio: 'inherit' });
  console.error('\nFAIL: Verification passed on chain-broken database!');
  process.exit(1);
} catch (error) {
  console.log('\nSUCCESS: Verification caught the chain breach.');
}

fs.unlinkSync(tamperDbPath);
console.log('\n--- Hash Chain Tamper Proofing Test Passed ---');
