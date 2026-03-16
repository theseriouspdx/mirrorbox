const { spawnSync } = require('child_process');
const { Operator } = require('../src/auth/operator');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const manifestPath = path.join(PROJECT_ROOT, '.dev/run/mcp.json');

async function testLiveRouting() {
  if (!fs.existsSync(manifestPath)) {
    console.log('SKIP: Live MCP manifest not found. Routing matrix test skipped.');
    return;
  }

  console.log('--- Testing Live Routing Matrix ---');

  const op = new Operator();
  await op.startMCP();
  
  // Test Case 1: graph_search
  console.log('Case 1: graph_search');
  const searchResult = await op.callMCPTool('graph_search', { pattern: 'GraphStore' });
  if (searchResult && Array.isArray(searchResult)) {
    console.log(`   Found ${searchResult.length} nodes.`);
  } else {
    throw new Error('graph_search failed to return results');
  }

  // Test Case 2: graph_query_impact (using a known node if search worked)
  if (searchResult.length > 0) {
    const nodeId = searchResult[0].id;
    console.log(`Case 2: graph_query_impact for ${nodeId}`);
    const impact = await op.callMCPTool('graph_query_impact', { nodeId });
    if (impact && impact.nodes) {
      console.log(`   Impact graph has ${impact.nodes.length} nodes.`);
    } else {
      throw new Error('graph_query_impact failed');
    }
  }

  console.log('PASS: Live routing matrix verification successful.');
}

testLiveRouting().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
