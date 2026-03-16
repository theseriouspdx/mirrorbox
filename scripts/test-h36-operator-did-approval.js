const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = process.env.MBO_PROJECT_ROOT || process.cwd();
const operatorPath = path.join(ROOT, 'src/auth/operator.js');
const didOrchestratorPath = path.join(ROOT, 'src/auth/did-orchestrator.js');
const didPromptsPath = path.join(ROOT, 'src/auth/did-prompts.js');

function checkDidBlindnessStatic() {
  const didOrch = fs.readFileSync(didOrchestratorPath, 'utf8');
  const didPrompts = fs.readFileSync(didPromptsPath, 'utf8');

  assert(didOrch.includes('buildReviewerPrompt(taskContext)'), 'Reviewer prompt call must be blind (no planner output arg)');
  assert(didOrch.includes('protectedHashes'), 'DID orchestrator must compute protected hashes');
  assert(
    /callModel\([\s\S]*?'componentPlanner'[\s\S]*?protectedHashes[\s\S]*?\)/m.test(didOrch),
    'Reviewer call must pass protected hashes for blind isolation'
  );
  assert(!didPrompts.includes('PLANNER OUTPUT:'), 'Reviewer round-1 prompt must not include planner output block');
}

async function checkOperatorFlow() {
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
  assert.strictEqual(approvalRes.status, 'audit_pending', 'Approval path should pause at audit gate');
  assert.deepStrictEqual(stage6Files, ['src/auth/did-orchestrator.js'], 'Stage 6 must use reconciled plan scope, not raw classification fallback');
  assert.deepStrictEqual(callOrder.slice(0, 5), ['stage3', 'stage4', 'stage4_5', 'stage6', 'stage7'], 'Pipeline stage order mismatch before audit pause');

  await op.runStage8({ files: ['src/auth/did-orchestrator.js'] }, { tier: 2 });
  assert(stage11Ran, 'Stage 11 must be chained after approved Stage 8 path');
}

(async () => {
  try {
    checkDidBlindnessStatic();
    await checkOperatorFlow();
    console.log('PASS: H36 operator + DID + approval flow checks');
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }
})();
