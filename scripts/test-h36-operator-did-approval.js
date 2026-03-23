'use strict';

/**
 * test-h36-operator-did-approval.js
 *
 * Verifies the H36 contract for DID blindness and Operator approval flow.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const assert = require('assert');

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
console.log('── Environment OK — proceeding with h36 test ─────────────────────\n');

const results = [];

function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

const ROOT = process.env.MBO_PROJECT_ROOT || process.cwd();
const operatorPath = path.join(ROOT, 'src/auth/operator.js');
const didOrchestratorPath = path.join(ROOT, 'src/auth/did-orchestrator.js');
const didPromptsPath = path.join(ROOT, 'src/auth/did-prompts.js');

function checkDidBlindnessStatic() {
  console.log('Static Check: DID Blindness Invariants');
  const didOrch = fs.readFileSync(didOrchestratorPath, 'utf8');
  const didPrompts = fs.readFileSync(didPromptsPath, 'utf8');

  const c1 = didOrch.includes('buildReviewerPrompt(taskContext)');
  const c2 = didOrch.includes('protectedHashes');
  const c3 = /callModel\([\s\S]*?'componentPlanner'[\s\S]*?protectedHashes[\s\S]*?\)/m.test(didOrch);
  const c4 = !didPrompts.includes('PLANNER OUTPUT:');

  record('Reviewer prompt call is blind (no planner output)', c1);
  record('DID orchestrator computes protected hashes', c2);
  record('Reviewer call passes protected hashes for isolation', c3);
  record('Round-1 prompt excludes planner output block', c4);
}

async function checkOperatorFlow() {
  console.log('\nDynamic Check: Operator Approval Flow Pipeline');
  const { Operator } = require('../src/auth/operator');
  const op = new Operator('dev');

  const callOrder = [];
  let stage6Files = null;
  let stage11Ran = false;

  op.requestApproval = async () => ({ approved: true });
  op.runStage3 = async () => {
    callOrder.push('stage3');
    return {
      status: 'plan_agreed',
      plan: {
        filesToChange: ['src/auth/did-orchestrator.js'],
        diff: 'diff --git a/src/auth/did-orchestrator.js b/src/auth/did-orchestrator.js\n+++ b/src/auth/did-orchestrator.js\n'
      }
    };
  };
  op.runStage4 = async () => {
    callOrder.push('stage4');
    return { status: 'code_agreed', code: '// mock code' };
  };
  op.runStage4_5 = async () => {
    callOrder.push('stage4_5');
    return { status: 'pass' };
  };
  op.runStage6 = async (_code, files) => {
    callOrder.push('stage6');
    stage6Files = files;
    return { modifiedFiles: files, validatorOutput: 'PASS', validatorPassed: true };
  };
  op.runStage7 = async () => {
    callOrder.push('stage7');
    op.stateSummary.pendingAudit = { modifiedFiles: stage6Files || [] };
    return { approved: false, pendingAuditPackage: { summary: 'ok' } };
  };
  op.runStage11 = async () => {
    stage11Ran = true;
    callOrder.push('stage11');
  };

  op.stateSummary.pendingDecision = {
    classification: {
      rationale: 'h36-test',
      files: ['src/auth/operator.js']
    },
    routing: { tier: 2, blastRadius: [] }
  };

  const approvalRes = await op.handleApproval('go');
  const c1 = approvalRes.status === 'audit_pending';
  const c2 = JSON.stringify(stage6Files) === JSON.stringify(['src/auth/did-orchestrator.js']);
  const c3 = JSON.stringify(callOrder.slice(0, 5)) === JSON.stringify(['stage3', 'stage4', 'stage4_5', 'stage6', 'stage7']);

  record('Approval path pauses at audit gate', c1);
  record('Stage 6 uses reconciled plan scope', c2);
  record('Pipeline stage order is correct before audit', c3);

  await op.runStage8({ files: ['src/auth/did-orchestrator.js'] }, { tier: 2 });
  record('Stage 11 is chained after approved Stage 8', stage11Ran);
}

async function main() {
  console.log('--- scripts/test-h36-operator-did-approval.js — H36 Contract Validation ---\n');
  
  checkDidBlindnessStatic();
  await checkOperatorFlow();

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── H36 DID + Approval Flow Summary Table ────────────────────────');
  console.log('| Contract Requirement                           | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-h36-operator-did-approval.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
