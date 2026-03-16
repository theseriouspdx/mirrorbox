const { DBManager } = require('./src/state/db-manager');
const GraphStore = require('./src/graph/graph-store');
const StaticScanner = require('./src/graph/static-scanner');
const path = require('path');

const root = process.cwd();
const testDb = new DBManager(path.join(__dirname, 'data/test-graph.db'));
const graphStore = new GraphStore(testDb);
const staticScanner = new StaticScanner(graphStore, {
  instanceType: 'dev',
  scanRoots: [path.join(root, 'src')]
});

async function test() {
  graphStore.clearGraph();

  console.log('Scanning src directory...');
  await staticScanner.scanDirectory(path.join(root, 'src'), root);

  const nodes = graphStore.search('');
  console.log(`Total nodes found: ${nodes.length}`);

  const functions = nodes.filter(n => n.type === 'function');
  console.log(`Functions found: ${functions.length}`);
  functions.slice(0, 5).forEach(f => console.log(` - ${f.name} in ${f.path}`));

  const edges = graphStore.getImpact('file://src/auth/call-model.js');
  console.log(`Impact of call-model.js (dependents): ${edges.length}`);

  const indexImports = graphStore.getDependencies('file://src/index.js');
  console.log(`index.js imports: ${indexImports.length}`);
  indexImports.forEach(i => console.log(` - imports ${i.id}`));
}

test().catch(console.error);
