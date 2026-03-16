const { DBManager } = require('./src/state/db-manager');
const GraphStore = require('./src/graph/graph-store');
const path = require('path');
const assert = require('assert');

const testDb = new DBManager(path.join(__dirname, 'data/test-graph.db'));
const graphStore = new GraphStore(testDb);

graphStore.clearGraph();

const node1 = { id: 'file://src/auth.js', type: 'file', name: 'auth.js', path: 'src/auth.js', metadata: { size: 1024 } };
graphStore.upsertNode(node1);
const retrievedNode = graphStore.getNode('file://src/auth.js');
assert.strictEqual(retrievedNode.name, 'auth.js');
assert.deepStrictEqual(retrievedNode.metadata, { size: 1024 });

const node2 = { id: 'file://src/index.js', type: 'file', name: 'index.js', path: 'src/index.js' };
graphStore.upsertNode(node2);
graphStore.upsertEdge({ source_id: 'file://src/index.js', target_id: 'file://src/auth.js', relation: 'IMPORTS', source: 'static' });

const impact = graphStore.getImpact('file://src/auth.js');
assert.strictEqual(impact.length, 1);
assert.strictEqual(impact[0].id, 'file://src/index.js');

graphStore.upsertEdge({ source_id: 'file://src/index.js', target_id: 'file://src/auth.js', relation: 'IMPORTS', source: 'runtime' });
const deps = graphStore.getDependencies('file://src/index.js');
assert.strictEqual(deps[0].source, 'runtime');

console.log('Graph Store tests PASSED.');
