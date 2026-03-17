const { Operator } = require('../src/auth/operator');
const db = require('../src/state/db-manager');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('--- MBO Routing Matrix Validation (MOCKED MCP TRANSPORT) ---');
  let insertedVersion = null;
  
  const operator = new Operator('dev');
  // Mock mcpServer to satisfy Operator's internal checks
  operator.mcpServer = { 
    stdin: { write: () => {} },
    kill: () => {}
  };
  
  // Mock callMCPTool to simulate a running MCP
  operator.callMCPTool = async () => {
    return { content: [{ text: JSON.stringify({ affectedFiles: ['mock-impacted.js'] }) }] };
  };

  console.log('Test 1: _graphQueryImpact routing (Mirror)');
  const mirrorResult = await operator._graphQueryImpact('src/index.js', 'mirror');
  console.log('Mirror result (mocked MCP):', JSON.stringify(mirrorResult));

  console.log('\nTest 2: _graphQueryImpact routing (Subject - expected null if no subjectRoot)');
  const subjectResult = await operator._graphQueryImpact('src/index.js', 'subject');
  console.log('Subject result:', subjectResult);

  // Mock a subjectRoot in the DB to test the branch
  const mockProfile = {
    projectType: 'existing',
    users: 'test users',
    primeDirective: 'keep tests safe',
    q3Raw: 'keep tests safe',
    q4Raw: 'none',
    languages: ['JavaScript'],
    frameworks: ['Node.js'],
    buildSystem: 'npm',
    testCoverage: 0,
    hasCI: false,
    verificationCommands: ['npm test'],
    dangerZones: [],
    canonicalConfigPath: 'package.json',
    onboardingVersion: 1,
    binaryVersion: '0.0.0-test',
    subjectRoot: path.join(process.cwd(), 'subject_test_root'),
    projectNotes: {}
  };
  fs.mkdirSync(path.join(process.cwd(), 'subject_test_root/data'), { recursive: true });
  
  const insertResult = db.run('INSERT INTO onboarding_profiles (profile_data, created_at) VALUES (?, ?)',
    [JSON.stringify(mockProfile), Date.now()]);
  insertedVersion = Number(insertResult.lastInsertRowid || 0);

  console.log('\nTest 3: _graphQueryImpact (Subject - with mock subjectRoot)');
  try {
    const subjectResult2 = await operator._graphQueryImpact('src/index.js', 'subject');
    console.log('Subject result (mocked DB branch reached):', subjectResult2);
  } catch (e) {
    console.log('Subject result (mocked) failed as expected (no DB at path):', e.message);
  }

  // Cleanup
  if (insertedVersion > 0) {
    db.run('DELETE FROM onboarding_profiles WHERE version = ?', [insertedVersion]);
  }
  fs.rmSync(path.join(process.cwd(), 'subject_test_root'), { recursive: true, force: true });

  console.log('\n--- Validation Complete ---');
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
