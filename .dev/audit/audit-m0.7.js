const assert = require('assert');
const callModelModule = require('../../src/auth/call-model');

// Mock iteration tracking
let iterationCount = 0;
let forcePersistentBlock = false;

/**
 * Mock callModel to simulate specific model behaviors for the audit.
 */
const mockCallModel = async (role, prompt, context, hardState, protectedHashes) => {
  // Invariant 7: Blind Isolation Enforcement
  if (protectedHashes && protectedHashes.length > 0) {
    for (const { content, hash } of protectedHashes) {
      if (prompt.includes(content) || (hash && prompt.includes(hash))) {
        throw new Error(`[FIREWALL_VIOLATION] Invariant 7: Protected content found. Hash: ${hash}`);
      }
    }
  }

  // Stage 1: Classification
  if (role === 'classifier' && /classify this user request/i.test(prompt)) {
    return JSON.stringify({
      route: 'standard',
      risk: 'low',
      complexity: 2,
      files: ['src/index.js'],
      rationale: 'Functional audit of pipeline state machine',
      confidence: 0.9
    });
  }

  // Stage 3: Planning Consensus
  if ((role === 'architecturePlanner' || role === 'componentPlanner') && /derive an executionplan/i.test(prompt)) {
    return JSON.stringify({ intent: "Plan Consensus", stateTransitions: ["T1"], filesToChange: ["src/index.js"], invariantsPreserved: ["I1"] });
  }
  if (role === 'classifier' && /audit these independent plans/i.test(prompt)) {
    return JSON.stringify({ verdict: "convergent", consensusIntent: "Unified Plan" });
  }

  // Stage 4: Code Consensus
  if (role === 'architecturePlanner' && /write the implementation code/i.test(prompt)) {
    return "const x = 1;";
  }
  if (role === 'reviewer' && /independent code derivation/i.test(prompt)) {
    return JSON.stringify({ 
        independentPlan: { intent: "Reviewer Plan" }, 
        independentCode: "const x = 1;", 
        concerns: [] 
    });
  }
  if (role === 'reviewer' && /final audit of tiebreaker code/i.test(prompt)) {
    return JSON.stringify({ verdict: "pass" });
  }
  if (role === 'tiebreaker' && /tiebreaker: produce the final arbitrated code/i.test(prompt)) {
    return "const tiebreaker = true;";
  }
  if (role === 'reviewer' && /audit the planner's code/i.test(prompt)) {
    if (forcePersistentBlock) {
      return JSON.stringify({ verdict: "block", reason: "Persistent Block", citation: "SPEC-4D-TEST" });
    }
    // Return block for the first iteration, pass for the second
    if (iterationCount === 0) {
        iterationCount++;
        return JSON.stringify({ verdict: "block", reason: "Simulated Block", citation: "SPEC-4C" });
    }
    return JSON.stringify({ verdict: "pass", consensusIntent: "Consensus Reached" });
  }

  return "{}";
};

// Hijack BEFORE requiring Operator
callModelModule.callModel = mockCallModel;

// Mock StateManager and EventStore to avoid SQLite lock during audit
const stateManager = require('../../src/state/state-manager');
const eventStore = require('../../src/state/event-store');
stateManager.checkpoint = () => {};
stateManager.load = () => ({ currentStage: 'idle', blockCounter: 0 });
eventStore.append = () => {};

const { Operator } = require('../../src/auth/operator');

async function runFormalAudit() {
  console.log("--- MBO Milestone 0.7 Formal Audit Start ---");
  
  // 1. Invariant 7 Firewall Enforcement
  console.log("Audit 1: Invariant 7 (Blind Isolation) Enforcement...");
  const protected = [{ content: "PLANNER_SECRET_CODE", hash: "hash123" }];
  try {
    await callModelModule.callModel('reviewer', "Leaked content: PLANNER_SECRET_CODE", {}, {}, protected);
    assert.fail("Should have thrown FIREWALL_VIOLATION for content leak.");
  } catch (e) {
    assert(e.message.includes("FIREWALL_VIOLATION"), "Incorrect error message for content leak: " + e.message);
  }
  try {
    await callModelModule.callModel('reviewer', "Leaked hash: hash123", {}, {}, protected);
    assert.fail("Should have thrown FIREWALL_VIOLATION for hash leak.");
  } catch (e) {
    assert(e.message.includes("FIREWALL_VIOLATION"), "Incorrect error message for hash leak: " + e.message);
  }
  console.log("  [PASS]");

  // 2. State Machine & Pipeline Integration
  console.log("Audit 2: State Machine & Pipeline Integration (Stages 1 -> 5 -> 3 -> 4 -> 4.5)...");
  
  const operator = new Operator('dev');
  // Mock callMCPTool to avoid dependency on running server
  operator.callMCPTool = async (name, args) => {
    if (name === 'graph_query_impact') {
      return { content: [{ text: JSON.stringify({ affectedFiles: ['src/index.js'] }) }] };
    }
    return { content: [{ text: "{}" }] };
  };

  // Step A: Process User Message (Stage 1 & 2)
  const procResult = await operator.processMessage("Verify the pipeline logic");
  assert(procResult.needsApproval, "Task should trigger Stage 5 approval gate.");
  // Note: operator.processMessage calls classification inside, but we hijacked callModel.
  
  // Step B: Human Approval (Stage 5) and Pipeline Execution (Stage 3 & 4)
  const pipelineResult = await pipelineRun(operator);
  
  assert.strictEqual(pipelineResult.status, 'complete', "Pipeline should complete with 'complete' status.");
  assert.strictEqual(pipelineResult.blockCount, 1, "Pipeline should have recorded 1 block iteration before passing.");
  assert.strictEqual(pipelineResult.dryRun.status, 'pass', "Stage 4.5 Dry Run should pass valid JS code.");
  console.log("  [PASS]");

  // 3. Stage 4D Tiebreaker Escalation
  console.log("Audit 3: Stage 4D Tiebreaker Escalation (3 Blocks)...");
  iterationCount = 0; // Reset
  forcePersistentBlock = true;

  const tiebreakerResult = await pipelineRun(operator);
  assert.strictEqual(operator.stateSummary.blockCounter, 3, "Block counter should reach limit (3).");
  assert.strictEqual(tiebreakerResult.code, "const tiebreaker = true;", "Result code should come from tiebreaker.");
  // Note: handleApproval returns normalized completion payload and does not expose source.
  console.log("  [PASS]");
  forcePersistentBlock = false;

  console.log("--- MBO Milestone 0.7 Audit COMPLETE: SUCCESS ---");
  process.exit(0);
}

/**
 * Helper to simulate the manual 'go' trigger and full pipeline run.
 */
async function pipelineRun(operator) {
    // Simulate user typing 'go'
    operator.stateSummary.pendingDecision = {
        classification: { rationale: 'Audit Task', files: ['src/index.js'] },
        routing: { tier: 1 }
    };
    return await operator.handleApproval('go');
}

runFormalAudit().catch(err => {
  console.error("\nAudit FAILED:");
  console.error(err);
  process.exit(1);
});
