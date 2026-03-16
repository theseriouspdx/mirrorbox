#!/usr/bin/env node
// Seed the onboarding profile for the Subject world (MBO_Alpha).
// Writes subjectRoot + testCommand into onboarding_profiles and
// writes relaySocket into Subject's .mbo/config.json so relay-emitter.js
// can find Mirror's UDS socket without an env var.
//
// Usage:
//   node scripts/seed-subject-profile.js [--subject-root <path>] [--test-command <cmd>]
//   Defaults: subjectRoot=/Users/johnserious/MBO_Alpha  testCommand=npm test
//
// Idempotent: existing profile is replaced, not duplicated.

'use strict';

const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

const MBO_ROOT = path.resolve(__dirname, '..');

// --- Parse args -----------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const subjectRoot  = argVal('--subject-root')  || '/Users/johnserious/MBO_Alpha';
const testCommand  = argVal('--test-command')  || 'npm test';
const relaySock    = path.join(MBO_ROOT, '.dev', 'run', 'relay.sock');

// --- Load DB --------------------------------------------------------------
const { DBManager } = require('../src/state/db-manager');
const db = new DBManager(path.join(MBO_ROOT, 'data', 'mirrorbox.db'));

// --- Validate subject root ------------------------------------------------
if (!fs.existsSync(subjectRoot)) {
  console.error(`[seed-subject-profile] ERROR: subjectRoot does not exist: ${subjectRoot}`);
  process.exit(1);
}

// --- Upsert profile -------------------------------------------------------
const profileData = JSON.stringify({ subjectRoot, testCommand, seededAt: new Date().toISOString() });
const existing = db.get('SELECT id FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
if (existing) {
  db.run('UPDATE onboarding_profiles SET profile_data = ?, version = version + 1 WHERE id = ?',
    [profileData, existing.id]);
  console.log(`[seed-subject-profile] Updated existing profile (id=${existing.id})`);
} else {
  const id = uuidv4();
  db.run('INSERT INTO onboarding_profiles (id, version, profile_data) VALUES (?, 1, ?)', [id, profileData]);
  console.log(`[seed-subject-profile] Inserted new profile (id=${id})`);
}

// --- Write relaySocket into Subject's .mbo/config.json -------------------
const subjectMboDir    = path.join(subjectRoot, '.mbo');
const subjectCfgPath   = path.join(subjectMboDir, 'config.json');
fs.mkdirSync(subjectMboDir, { recursive: true });

let subjectCfg = {};
if (fs.existsSync(subjectCfgPath)) {
  try { subjectCfg = JSON.parse(fs.readFileSync(subjectCfgPath, 'utf8')); }
  catch (_) { subjectCfg = {}; }
}
subjectCfg.relaySocket = relaySock;
fs.writeFileSync(subjectCfgPath, JSON.stringify(subjectCfg, null, 2) + '\n');
console.log(`[seed-subject-profile] Wrote relaySocket=${relaySock} → ${subjectCfgPath}`);

// --- Confirm --------------------------------------------------------------
const verify = db.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
const parsed = JSON.parse(verify.profile_data);
console.log('\n[seed-subject-profile] Profile now active:');
console.log(`  subjectRoot:  ${parsed.subjectRoot}`);
console.log(`  testCommand:  ${parsed.testCommand}`);
console.log(`  relaySocket:  ${subjectCfg.relaySocket}`);
console.log(`  seededAt:     ${parsed.seededAt}`);
console.log('\nDone.');
