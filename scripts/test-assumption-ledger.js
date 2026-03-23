'use strict';

const { Operator } = require('../src/auth/operator');
const assert = require('assert');
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
console.log('── Environment OK — proceeding with assumption-ledger test ───────\n');

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
  assert.ok(stage1_5.prompt.includes('Entropy Score'), 'Prompt must include ledger info (Entropy Score)');
  
  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Assumption Ledger Summary ───────────────────────────────────');
  console.log('| Metric               | Value                                  |');
  console.log('| -------------------- | -------------------------------------- |');
  console.log(`| Entropy Score        | ${stage1_5.assumptionLedger.entropyScore.toString().padEnd(38)} |`);
  console.log(`| Assumptions Count    | ${stage1_5.assumptionLedger.assumptions.length.toString().padEnd(38)} |`);
  console.log('────────────────────────────────────────────────────────────────\n');

  console.log('[PASS] Assumption Ledger logic works.');
  process.exit(0);
}

testLedger().catch(err => {
  console.error('[FAIL] Assumption Ledger test failed:', err);
  process.exit(1);
});
