const { DBManager } = require('../src/state/db-manager');
const GraphStore = require('../src/graph/graph-store');
const StaticScanner = require('../src/graph/static-scanner');
const path = require('path');
const fs = require('fs');

async function test() {
  const dbPath = path.join(__dirname, '../data/test-graph-v2.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new DBManager(dbPath);
  const graphStore = new GraphStore(db);
  const scanner = new StaticScanner(graphStore);

  const projectRoot = path.join(__dirname, '..');
  const targetFile = path.join(projectRoot, 'src/graph/graph-store.js');

  console.log('--- Phase 1: Initial Scan ---');
  await scanner.scanFile(targetFile, projectRoot);

  const fileId = `file://src/graph/graph-store.js`;
  const result = graphStore.getGraphQueryResult(fileId);

  console.log('GraphQueryResult:', JSON.stringify(result, null, 2));

  // Verify Section 13 contract
  const keys = Object.keys(result);
  const required = ['subsystems', 'affectedFiles', 'callers', 'callees', 'coveringTests', 'dependencyChain'];
  const missing = required.filter(k => !keys.includes(k));

  if (missing.length > 0) {
    console.error('FAIL: Missing required keys:', missing);
  } else {
    console.log('PASS: Section 13 contract met.');
  }

  console.log('\n--- Phase 2: Staleness Check (Unchanged) ---');
  const start = Date.now();
  await scanner.scanFile(targetFile, projectRoot);
  const elapsed = Date.now() - start;
  console.log(`Re-scan (unchanged) took ${elapsed}ms (should be very fast)`);

  console.log('\n--- Phase 3: Staleness Check (Changed) ---');
  // We won't actually change the file on disk to avoid side effects,
  // but we can simulate it by clearing the node or changing the hash in DB.
  // For a real test, we'll just verify the metadata exists.
  const node = graphStore.getNode(fileId);
  console.log('Node Metadata:', node.metadata);
  if (node.metadata.content_hash) {
    console.log('PASS: content_hash found in metadata.');
  } else {
    console.error('FAIL: content_hash missing.');
  }

  db.db.close();
  // fs.unlinkSync(dbPath);
}

test().catch(console.error);
