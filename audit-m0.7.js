const callModelModule = require('./src/auth/call-model');
const { Operator } = require('./src/auth/operator');
const assert = require('assert');

// Mock iteration tracking
let iterationCount = 0;

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
  if (role === 'classifier' && prompt.includes('Classify this user request')) {
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
  if (role === 'architecturePlanner' && prompt.includes('Derive an ExecutionPlan')) {
    return JSON.stringify({ intent: "Plan A", stateTransitions: ["T1"], filesToChange: ["src/index.js"], invariantsPreserved: ["I1"] });
  }
  if (role === 'componentPlanner' && prompt.includes('Derive an ExecutionPlan')) {
    return JSON.stringify({ intent: "Plan B", stateTransitions: ["T1"], filesToChange: ["src/index.js"], invariantsPreserved: ["I1"] });
  }
  if (role === 'classifier' && prompt.includes('Audit these independent plans')) {
    return JSON.stringify({ verdict: "convergent", consensusIntent: "Unified Plan" });
  }

  // Stage 4: Code Consensus
  if (role === 'architecturePlanner' && prompt.includes('Write the implementation code')) {
    return "const x = 1;";
  }
  if (role === 'reviewer' && prompt.includes('Independent Code Derivation')) {
    return JSON.stringify({ 
        independentPlan: { intent: "Reviewer Plan" }, 
        independentCode: "const x = 1;", 
        concerns: [] 
    });
  }
  if (role === 'reviewer' && prompt.includes('Final Audit of Tiebreaker Code')) {
    return JSON.stringify({ verdict: "pass" });
  }
  if (role === 'classifier' && prompt.includes('Audit the Planner\'s code')) {
    // Return block for the first iteration, pass for the second
    if (iterationCount === 0) {
        iterationCount++;
        return JSON.stringify({ verdict: "block", reason: "Simulated Block", citation: "SPEC-4C" });
    }
    return JSON.stringify({ verdict: "pass", consensusIntent: "Consensus Reached" });
  }

  return "{}";
};

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
  
  // Hijack callModel for the duration of the audit
  const originalCallModel = callModelModule.callModel;
  
  // Directly overwrite the property on the exported object
  callModelModule.callModel = mockCallModel;

  const operator = new Operator('dev');
  
  // Step A: Process User Message (Stage 1 & 2)
  const procResult = await operator.processMessage("Verify the pipeline logic");
  assert(procResult.needsApproval, "Task should trigger Stage 5 approval gate.");
  assert.strictEqual(operator.stateSummary.currentStage, 'classification');
  
  // Step B: Human Approval (Stage 5) and Pipeline Execution (Stage 3 & 4)
  const pipelineResult = await pipelineRun(operator);
  
  assert.strictEqual(pipelineResult.status, 'complete', "Pipeline should complete with 'complete' status.");
  assert.strictEqual(pipelineResult.blockCount, 1, "Pipeline should have recorded 1 block iteration before passing.");
  assert.strictEqual(pipelineResult.dryRun.status, 'pass', "Stage 4.5 Dry Run should pass valid JS code.");
  console.log("  [PASS]");

  // 3. Stage 4D Tiebreaker Escalation
  console.log("Audit 3: Stage 4D Tiebreaker Escalation (3 Blocks)...");
  iterationCount = 0; // Reset
  
  // Custom mock for 3 blocks
  callModelModule.callModel = async (role, prompt, ...args) => {
    if (role === 'classifier' && prompt.includes('Audit the Planner\'s code')) {
        return JSON.stringify({ verdict: "block", reason: "Persistent Block", citation: "SPEC-4D-TEST" });
    }
    if (role === 'tiebreaker' && prompt.includes('Tiebreaker: Produce the final arbitrated code')) {
        return "const tiebreaker = true;";
    }
    if (role === 'reviewer' && prompt.includes('Final Audit of Tiebreaker Code')) {
        return JSON.stringify({ verdict: "pass" });
    }
    return await mockCallModel(role, prompt, ...args);
  };

  const tiebreakerResult = await pipelineRun(operator);
  assert.strictEqual(operator.stateSummary.blockCounter, 3, "Block counter should reach limit (3).");
  assert.strictEqual(tiebreakerResult.code, "const tiebreaker = true;", "Result code should come from tiebreaker.");
  assert.strictEqual(tiebreakerResult.source, 'tiebreaker', "Source should be 'tiebreaker'.");
  console.log("  [PASS]");

  // Restore
  callModelModule.callModel = originalCallModel;
  console.log("--- MBO Milestone 0.7 Audit COMPLETE: SUCCESS ---");
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
