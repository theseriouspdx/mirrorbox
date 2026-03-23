'use strict';

/**
 * test-graph-v2.js
 *
 * Verifies the Section 13 contract for GraphQueryResult and staleness checks.
 */

const { DBManager } = require('../src/state/db-manager');
const GraphStore = require('../src/graph/graph-store');
const StaticScanner = require('../src/graph/static-scanner');
const path = require('path');
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
console.log('── Environment OK — proceeding with graph-v2 test ────────────────\n');

const results = [];

function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

async function main() {
  console.log('--- scripts/test-graph-v2.js — Section 13 Contract Validation ---\n');

  const dbPath = path.join(__dirname, '../data/test-graph-v2.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new DBManager(dbPath);
  const graphStore = new GraphStore(db);
  const scanner = new StaticScanner(graphStore);

  const projectRoot = path.join(__dirname, '..');
  const targetFile = path.join(projectRoot, 'src/graph/graph-store.js');

  // --- Phase 1: Initial Scan ---
  console.log('Phase 1: Initial Scan & Section 13 Contract');
  await scanner.scanFile(targetFile, projectRoot);

  const fileId = `file://src/graph/graph-store.js`;
  const result = graphStore.getGraphQueryResult(fileId);

  const keys = Object.keys(result);
  const required = ['subsystems', 'affectedFiles', 'callers', 'callees', 'coveringTests', 'dependencyChain'];
  const missing = required.filter(k => !keys.includes(k));
  record('Section 13 Contract (Required Keys)', missing.length === 0);

  // --- Phase 2: Staleness Check (Unchanged) ---
  console.log('\nPhase 2: Staleness Check (Unchanged)');
  const start = Date.now();
  await scanner.scanFile(targetFile, projectRoot);
  const elapsed = Date.now() - start;
  record('Fast re-scan for unchanged file', elapsed < 500); // 500ms is generous for cached scan

  // --- Phase 3: Staleness Check (Changed) ---
  console.log('\nPhase 3: Staleness Check (Metadata)');
  const node = graphStore.getNode(fileId);
  record('Metadata contains content_hash', !!(node && node.metadata && node.metadata.content_hash));

  db.db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Graph v2 Validation Summary Table ─────────────────────────────');
  console.log('| Check                                          | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-graph-v2.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
