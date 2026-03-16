const { Operator } = require('../src/auth/operator');
const db = require('../src/state/db-manager');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log("--- MBO Routing Matrix Validation (LIVE MCP) ---");
  
  const operator = new Operator('dev');
  // SKIP operator.startMCP() to avoid port conflict.
  // Instead, manually set up the MCP-like transport for this session if needed,
  // or rely on the fact that classifyRequest/determineRouting can work with 
  // a mocked MCP response for the impact query if needed.

  // In this environment, we just want to verify the logic of the new methods.
  
  console.log("Test 1: _graphQueryImpact routing (Mirror)");
  const mirrorResult = await operator._graphQueryImpact('src/index.js', 'mirror');
  console.log("Mirror result (from MCP):", JSON.stringify(mirrorResult).slice(0, 100));

  console.log("\nTest 2: _graphQueryImpact routing (Subject - expected null if no subjectRoot)");
  const subjectResult = await operator._graphQueryImpact('src/index.js', 'subject');
  console.log("Subject result:", subjectResult);

  // Mock a subjectRoot in the DB to test the branch
  const mockProfile = {
    subjectRoot: path.join(process.cwd(), 'subject_test_root')
  };
  fs.mkdirSync(path.join(process.cwd(), 'subject_test_root/data'), { recursive: true });
  // We won't actually create the DB there yet, but we can verify it reaches the require('../state/db-manager') block.
  
  db.run("INSERT OR REPLACE INTO onboarding_profiles (version, profile_data, created_at) VALUES (999, ?, ?)", 
    [JSON.stringify(mockProfile), Date.now()]);

  console.log("\nTest 3: _graphQueryImpact (Subject - with mock subjectRoot)");
  try {
    const subjectResult2 = await operator._graphQueryImpact('src/index.js', 'subject');
    console.log("Subject result (mocked):", subjectResult2);
  } catch (e) {
    console.log("Subject result (mocked) failed as expected (no DB at path):", e.message);
  }

  // Cleanup
  db.run("DELETE FROM onboarding_profiles WHERE version = 999");
  fs.rmSync(path.join(process.cwd(), 'subject_test_root'), { recursive: true, force: true });

  console.log("\n--- Validation Complete ---");
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
