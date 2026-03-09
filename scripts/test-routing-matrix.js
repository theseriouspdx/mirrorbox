const { Operator } = require('../src/auth/operator');
const db = require('../src/state/db-manager');
const path = require('path');
const fs = require('fs');

function withTimeout(promise, ms, name) {
  let timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]);
}

async function runTests() {
  console.log("--- MBO Routing Matrix Validation (with timeouts) ---");
  
  const operator = new Operator('dev');
  await operator.startMCP();

  // Mock onboarding profile for Tier 0 safelist
  const mockProfile = {
    primeDirective: "Test Prime Directive",
    safelist: ['src/index.js', 'package.json']
  };
  db.run("INSERT OR REPLACE INTO onboarding_profiles (version, profile_data, created_at) VALUES (1, ?, ?)", 
    [JSON.stringify(mockProfile), Date.now()]);

  const testCases = [
    {
      name: "Tier 0: Safelisted file, no blast radius",
      message: "Change background color in src/index.js",
      expectedTier: 0
    },
    {
      name: "Tier 1: Non-safelisted file, minimal complexity",
      message: "Update logic in src/auth/operator.js",
      expectedTier: 1
    },
    {
      name: "Tier 2: Multi-file change",
      message: "Refactor src/auth/operator.js and src/auth/call-model.js",
      expectedTier: 2
    },
    {
      name: "Tier 3: Architectural change",
      message: "Perform a major architectural refactor of the state management system",
      expectedTier: 3
    }
  ];

  for (const tc of testCases) {
    console.log(`\nTest: ${tc.name}`);
    console.log(`Input: "${tc.message}"`);
    
    try {
      console.log("-> Classifying (30s timeout)...");
      const classification = await withTimeout(operator.classifyRequest(tc.message), 30000, "Classification");
      console.log(`<- Classified: ${classification.route} (Confidence: ${classification.confidence})`);
      
      if (classification.needsClarification) {
        console.log(`Clarification needed: ${classification.rationale}`);
        continue;
      }

      console.log("-> Determining Routing (15s timeout)...");
      const routing = await withTimeout(operator.determineRouting(classification), 15000, "Routing");
      console.log(`<- Routed: Tier ${routing.tier}`);
      
      if (routing.tier === tc.expectedTier) {
        console.log("Verdict: PASS");
      } else {
        console.log(`Verdict: FAIL (Expected Tier ${tc.expectedTier})`);
      }
    } catch (e) {
      console.error(`Test Error: ${e.message}`);
    }
  }

  await operator.shutdown();
  console.log("\n--- Validation Complete ---");
  process.exit(0);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
