const eventStore = require('../src/state/event-store');
const assert = require('assert');

console.log('[TEST] Verifying EventStore EventEmitter...');
let eventReceived = false;

eventStore.on('event:mirror', (data) => {
  console.log('[TEST] Received event:', data.stage);
  if (data.stage === 'INTEGRITY_CHECK') {
    eventReceived = true;
  }
});

eventStore.append('INTEGRITY_CHECK', 'tester', { status: 'ok' }, 'mirror');

setTimeout(() => {
  if (eventReceived) {
    console.log('[PASS] EventStore streaming works.');
    process.exit(0);
  } else {
    console.error('[FAIL] EventStore streaming failed.');
    process.exit(1);
  }
}, 500);
