const { DBManager } = require('./src/state/db-manager');
const GraphStore = require('./src/graph/graph-store');
const StaticScanner = require('./src/graph/static-scanner');
const path = require('path');
const fs = require('fs');

async function test() {
  const root = process.cwd();
  const dbPath = path.join(root, 'data/test-spec.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  
  const db = new DBManager(dbPath);
  const graphStore = new GraphStore(db);
  const staticScanner = new StaticScanner(graphStore);

  console.log('Scanning SPEC.md...');
  const specPath = path.join(root, '.dev/spec/SPEC.md');
  await staticScanner.scanFile(specPath, root);

  const sections = db.query("SELECT * FROM nodes WHERE type = 'spec_section'");
  console.log(`Total spec sections found: ${sections.length}`);
  
  if (sections.length > 0) {
    console.log('First 5 sections:');
    sections.slice(0, 5).forEach(s => {
      console.log(` - [${s.id}] ${s.name} (line ${JSON.parse(s.metadata).startLine})`);
    });
  } else {
    console.error('FAILED: No spec sections found.');
    process.exit(1);
  }

  const fileNode = graphStore.getNode('file://.dev/spec/SPEC.md');
  if (fileNode) {
    console.log('Found SPEC.md file node.');
    const defines = db.query("SELECT * FROM edges WHERE source_id = 'file://.dev/spec/SPEC.md' AND relation = 'DEFINES'");
    console.log(`SPEC.md defines ${defines.length} sections.`);
  } else {
    console.error('FAILED: SPEC.md file node not found.');
    process.exit(1);
  }
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
