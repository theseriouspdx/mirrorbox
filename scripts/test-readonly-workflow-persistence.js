'use strict';

const assert = require('assert');
const os = require('os');

const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
];

let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) {
  console.log('\nEnvironment checks failed — aborting.\n');
  process.exit(2);
}
console.log('── Environment OK — proceeding with read-only workflow persistence test ──\n');

const { Operator } = require('../src/auth/operator');

async function testReadOnlyHintPersistence() {
  console.log('[TEST] Read-only workflow retains pin guidance into planning...');

  const op = new Operator('dev');
  op.activeModelWindow = 32000;
  op.checkContextLifecycle = async () => {};
  op.classifyRequest = async () => ({
    route: 'analysis',
    worldId: 'mirror',
    risk: 'low',
    complexity: 1,
    files: [],
    rationale: 'Readiness-check workflow verification',
    confidence: 0.95,
    readOnlyWorkflow: true,
  });
  op.determineRouting = async () => ({ tier: 0, blastRadius: [] });
  op.runStage1_5 = async () => ({
    needsApproval: true,
    projectedContext: null,
    assumptionLedger: {
      assumptions: [{ id: 'A1', impact: 'Low', statement: 'Read-only verification only', autonomousDefault: 'No writes.' }],
      blockers: [],
      entropyScore: 0.5,
    },
    signOffBlock: 'Entropy Score: 0.5',
    prompt: 'Spec refinement gate: Confirm intent',
  });

  let capturedHints = null;
  op.runStage3 = async (_classification, _routing, _ctx, _executorLogs, _locks) => {
    capturedHints = [...op.userHintBuffer];
    return {
      status: 'plan_agreed',
      plan: {
        intent: 'Execute readiness-check workflow with minimal non-destructive verification.',
        filesToChange: [],
        rationale: 'read-only',
      },
    };
  };
  op.runStage6 = async () => ({ modifiedFiles: [], validatorOutput: 'PASS', validatorPassed: true });
  op.runStage7 = async () => ({ approved: false, pendingAuditPackage: { summary: 'ok' } });

  const first = await op.processMessage('Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.');
  assert.equal(first.needsApproval, true, 'read-only workflow should require sign-off');

  const hinted = await op.processMessage('pin: preserve the read-only path and choose the smallest audit-ready workflow');
  assert.equal(hinted.status, 'spec_refinement_updated', 'pin command should be accepted during sign-off');
  assert.ok(hinted.prompt.includes('Queued hint for planning'), 'pin command should confirm queued hint persistence');

  const result = await op.processMessage('go');
  assert.equal(result.status, 'audit_pending', 'read-only workflow should reach the audit package');
  assert.deepEqual(
    capturedHints,
    ['pin: preserve the read-only path and choose the smallest audit-ready workflow'],
    'planning stage should receive persisted sign-off hint'
  );

  return {
    workflow: 'read-only',
    status: 'PASS',
    detail: 'pin guidance persisted through Stage 1.5 into planning and reached audit gate',
  };
}

async function testDidTiebreakerPath() {
  console.log('[TEST] DID path escalates to tiebreaker and survives compact verdict sections...');

  const op = new Operator('dev');
  op.activeModelWindow = 32000;
  op.checkContextLifecycle = async () => {};
  op.didOrchestrator.shouldRunDID = () => false;

  const responses = [
    'RATIONALE:\nPlan A\n\nFILES:\nnone\n\nINVARIANTS:\nRead-only\n\nDIFF:\nread-only.',
    'RATIONALE:\nPlan B\n\nFILES:\nnone\n\nINVARIANTS:\nRead-only\n\nDIFF:\nread-only.',
    'VERDICT:\ndivergent\n\nCONFLICT:\nNeed tiebreaker\n\nCONSENSUS INTENT:\nComplete the workflow safely.',
    'RATIONALE:\nTiebreak wins\n\nFILES:\nnone\n\nINVARIANTS:\nRead-only\n\nFINAL DIFF:\nread-only\n\nVERDICT:\nGO',
  ];

  op._callModel = async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra model call');
    return next;
  };

  const classification = {
    rationale: 'Readiness-check workflow verification',
    files: [],
    readOnlyWorkflow: true,
    worldId: 'mirror',
    route: 'analysis',
    risk: 'low',
    complexity: 1,
  };
  const routing = { tier: 1, blastRadius: [] };

  const stage3 = await op.runStage3(classification, routing, [], null, { lockedWorld: 'mirror', lockedFiles: [] });
  assert.equal(stage3.needsTiebreaker, true, 'divergent compact verdict should trigger tiebreaker');
  assert.equal(stage3.conflict, 'Need tiebreaker', 'conflict text should be preserved from compact sections');

  const tiebreakPlan = await op.runStage3D(stage3.conflict, classification, routing);
  assert.equal(tiebreakPlan.verdict, 'GO', 'tiebreaker should parse compact verdict sections');

  return {
    workflow: 'did+tiebreaker',
    status: 'PASS',
    detail: 'compact VERDICT/CONFLICT sections now parse cleanly through plan arbitration',
  };
}

async function main() {
  const rows = [];
  rows.push(await testReadOnlyHintPersistence());
  rows.push(await testDidTiebreakerPath());

  console.log('\n── Read-Only Workflow Persistence Summary ───────────────────────');
  console.log('| Workflow            | Status | Detail |');
  console.log('| ------------------- | ------ | ------ |');
  for (const row of rows) {
    console.log(`| ${row.workflow.padEnd(19)} | ${row.status.padEnd(6)} | ${row.detail} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');
  console.log('PASS  test-readonly-workflow-persistence.js');
}

main().catch((err) => {
  console.error('[FAIL] Read-only workflow persistence test failed:', err);
  process.exit(1);
});
