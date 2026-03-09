const stateManager = require('../src/state/state-manager');
const eventStore = require('../src/state/event-store');
const assert = require('assert');

function testRecovery() {
  console.log('--- Testing State Recovery ---');

  // 1. Snapshot is last event -> recover returns it
  stateManager.snapshot({
    currentTask: '0.3-01',
    currentStage: 'STATE',
    activeModel: 'ORCHESTRATOR',
    filesInScope: [],
    recoveryAttempts: 0,
    progressSummary: 'Test snapshot'
  });
  
  let recovered = stateManager.recover();
  assert.strictEqual(recovered.ok !== false, true, 'Should recover successfully');
  assert.strictEqual(recovered.currentTask, '0.3-01', 'Task should match snapshot');

  // 2. Non-snapshot is last event
  // Add a non-STATE event
  eventStore.append('PLANNING', 'TEST_ACTOR', { payload: 'not a snapshot' });
  
  // Recover should still find the last snapshot because of WHERE stage = 'STATE'
  recovered = stateManager.recover();
  assert.strictEqual(recovered.ok !== false, true, 'Should still find the last snapshot even if other events happened');
  assert.strictEqual(recovered.currentTask, '0.3-01');

  console.log('PASS: All recovery tests passed.');
}

testRecovery();
