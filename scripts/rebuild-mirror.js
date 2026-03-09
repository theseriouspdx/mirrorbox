const { DBManager } = require('../src/state/db-manager');
const GraphStore = require('../src/graph/graph-store');
const StaticScanner = require('../src/graph/static-scanner');
const path = require('path');
const fs = require('fs');

async function rebuild() {
  const dbPath = path.join(__dirname, '../data/mirrorbox.db');
  if (fs.existsSync(dbPath)) {
    console.log(`Deleting old ${dbPath}...`);
    fs.unlinkSync(dbPath);
  }

  const db = new DBManager(dbPath);
  const graphStore = new GraphStore(db);
  const scanner = new StaticScanner(graphStore);

  const projectRoot = path.join(__dirname, '..');
  const srcRoot = path.join(projectRoot, 'src');

  console.log('--- Phase 1: Rebuilding mirrorbox.db (Static Scan) ---');
  await scanner.scanDirectory(srcRoot, projectRoot);

  console.log('--- Phase 2: LSP Enrichment ---');
  try {
    await scanner.enrich(projectRoot);
  } catch (err) {
    console.warn('[WARN] LSP Enrichment failed, proceeding with skeleton graph:', err.message);
  }

  const nodeCount = db.get("SELECT COUNT(*) as count FROM nodes").count;
  const edgeCount = db.get("SELECT COUNT(*) as count FROM edges").count;
  console.log(`Rebuild complete: ${nodeCount} nodes, ${edgeCount} edges.`);

  db.db.close();
}

rebuild().catch(console.error);
