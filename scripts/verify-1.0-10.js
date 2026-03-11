const { Operator } = require('../src/auth/operator');
const assert = require('assert');

async function testLedger() {
  console.log('[TEST] Verifying Operator Assumption Ledger (Stage 1.5)...');
  
  const operator = new Operator('dev');
  // Mock MCP tool calls
  operator.callMCPTool = async (name, args) => {
    console.log(`[TEST] Mock MCP Tool Call: ${name}`);
    return { content: [{ text: JSON.stringify({ nodes: [] }) }] };
  };
  operator.activeModelWindow = 32000;

  const classification = { rationale: "Add a new endpoint to the server", files: ["src/graph/mcp-server.js"] };
  const routing = { tier: 1 };
  
  console.log('[TEST] Calling Stage 1.5 logic...');
  const stage1_5 = await operator.runStage1_5(classification, routing);
  
  console.log('[TEST] Sign-Off Block:', stage1_5.signOffBlock);
  
  assert.ok(stage1_5.assumptionLedger, 'Assumption ledger must be generated');
  assert.ok(stage1_5.assumptionLedger.entropyScore >= 0, 'Entropy score must be computed');
  assert.ok(stage1_5.prompt.includes('Assumption Ledger'), 'Prompt must include ledger info');
  
  console.log('[PASS] Assumption Ledger logic works.');
  process.exit(0);
}

testLedger().catch(err => {
  console.error('[FAIL] Assumption Ledger test failed:', err);
  process.exit(1);
});
