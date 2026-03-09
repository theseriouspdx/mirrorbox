/**
 * Audit Artifact: chain_tamper_proof.js
 * Demonstrates Invariant 4 bypass: modify event + recalculate hash → verifier reports PASS
 * Run: node chain_tamper_proof.js (from /Users/johnserious/MBO/)
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DB = path.join(__dirname, '../../../data/mirrorbox.db');
const TAMPERED_DB = '/tmp/mirrorbox_audit_tamper.db';

if (!fs.existsSync(SRC_DB)) {
  console.error('ERROR: mirrorbox.db not found. Run test-state.js first.');
  process.exit(1);
}

// Step 1: Copy the real DB
fs.copyFileSync(SRC_DB, TAMPERED_DB);
console.log('Step 1: Copied mirrorbox.db to', TAMPERED_DB);

// Step 2: Tamper Event 2 (PLANNING stage)
const db = new Database(TAMPERED_DB);
const original = db.prepare("SELECT * FROM events WHERE stage = 'PLANNING'").get();

if (!original) {
  console.error('ERROR: No PLANNING event found. Run test-state.js first.');
  db.close();
  process.exit(1);
}

console.log('\nStep 2: Original event:');
console.log('  id:      ', original.id);
console.log('  payload: ', original.payload.substring(0, 70) + '...');
console.log('  hash:    ', original.hash);

const tamperedPayload = '{"message":"AUDIT TAMPER: original record deleted","classification":"clean"}';
const tamperedHash = crypto.createHash('sha256').update(tamperedPayload).digest('hex');

db.prepare('UPDATE events SET payload = ?, hash = ? WHERE id = ?')
  .run(tamperedPayload, tamperedHash, original.id);
db.close();

console.log('\nStep 3: Tampered event written:');
console.log('  payload: ', tamperedPayload);
console.log('  hash:    ', tamperedHash);

// Step 4: Run verify-chain on tampered DB
console.log('\nStep 4: Running verify-chain.js on tampered database...');
const output = execSync(`node ${path.resolve(__dirname, '../../../scripts/verify-chain.js')} ${TAMPERED_DB}`).toString().trim();
console.log('  Result:', output);

if (output.includes('PASS')) {
  console.log('\nAUDIT_FAIL: Invariant 4 — tampered chain passes verification.');
  console.log('Root cause: hash = sha256(payload) only. No Merkle linkage.');
  console.log('Fix required: hash = sha256(payload + parent_hash)');
  process.exit(1);
}
