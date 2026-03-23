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

  console.log('[TEST] Verifying Tier 0 workflows still require assumption sign-off...');
  const tier0Operator = new Operator('dev');
  tier0Operator.activeModelWindow = 32000;
  tier0Operator.checkContextLifecycle = async () => {};
  tier0Operator.classifyRequest = async () => ({
    route: 'inline',
    worldId: 'mirror',
    risk: 'low',
    complexity: 1,
    files: ['README.md'],
    rationale: 'Tier 0 doc edit',
    confidence: 0.95,
  });
  tier0Operator.determineRouting = async () => ({ tier: 0, blastRadius: [] });
  tier0Operator.runStage1_5 = async (cls, routingInfo) => ({
    needsApproval: true,
    assumptionLedger: {
      assumptions: [{ id: 'A1', impact: 'Low', statement: 'Doc-only scope', autonomousDefault: 'Proceed conservatively.' }],
      blockers: [],
      entropyScore: 0.5,
    },
    projectedContext: null,
    signOffBlock: 'Entropy Score: 0.5',
    prompt: `Spec refinement gate: Tier ${routingInfo.tier}`,
  });

  const tier0Result = await tier0Operator.processMessage('Update README.md wording');
  assert.equal(tier0Result.needsApproval, true, 'Tier 0 workflow must still require approval');
  assert.ok(tier0Result.prompt.includes('Spec refinement gate'), 'Tier 0 prompt must show spec refinement gate');

  console.log('[TEST] Verifying read-only readiness workflow still enters assumption sign-off...');
  const readOnlyOperator = new Operator('dev');
  readOnlyOperator.activeModelWindow = 32000;
  readOnlyOperator.checkContextLifecycle = async () => {};
  readOnlyOperator.classifyRequest = async () => ({
    route: 'analysis',
    worldId: 'mirror',
    risk: 'low',
    complexity: 1,
    files: [],
    rationale: 'Readiness-check workflow verification',
    confidence: 0.95,
    readOnlyWorkflow: true,
  });
  readOnlyOperator.determineRouting = async () => ({ tier: 0, blastRadius: [] });
  readOnlyOperator.runStage1_5 = async (_cls, routingInfo) => ({
    needsApproval: true,
    assumptionLedger: {
      assumptions: [{ id: 'A1', impact: 'Low', statement: 'Read-only verification only', autonomousDefault: 'No writes.' }],
      blockers: [],
      entropyScore: 0.5,
    },
    projectedContext: null,
    signOffBlock: 'Entropy Score: 0.5',
    prompt: `Spec refinement gate: Tier ${routingInfo.tier} read-only`,
  });

  const readOnlyResult = await readOnlyOperator.processMessage('Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.');
  assert.equal(readOnlyResult.needsApproval, true, 'Read-only workflow must still require approval');
  assert.ok(readOnlyResult.prompt.includes('Spec refinement gate'), 'Read-only prompt must show spec refinement gate');

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('── Workflow Gate Summary ───────────────────────────────────────');
  console.log('| Workflow             | Gate Required |');
  console.log('| -------------------- | ------------- |');
  console.log(`| Tier 0 doc edit       | ${String(!!tier0Result.needsApproval).padEnd(13)} |`);
  console.log(`| Read-only workflow    | ${String(!!readOnlyResult.needsApproval).padEnd(13)} |`);
  console.log('────────────────────────────────────────────────────────────────\n');

  console.log('[PASS] Assumption Ledger gating covers Tier 0 and read-only workflows.');
  process.exit(0);
}

testLedger().catch(err => {
  console.error('[FAIL] Assumption Ledger test failed:', err);
  process.exit(1);
});
