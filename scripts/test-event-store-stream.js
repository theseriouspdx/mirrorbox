'use strict';

const eventStore = require('../src/state/event-store');
const assert = require('assert');
const os = require('os');

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
console.log('── Environment OK — proceeding with event-store test ─────────────\n');

console.log('[TEST] Verifying EventStore EventEmitter...');
let eventReceived = false;
let receivedStage = null;

eventStore.on('event:mirror', (data) => {
  console.log('[TEST] Received event:', data.stage);
  if (data.stage === 'INTEGRITY_CHECK') {
    eventReceived = true;
    receivedStage = data.stage;
  }
});

eventStore.append('INTEGRITY_CHECK', 'tester', { status: 'ok' }, 'mirror');

setTimeout(() => {
  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── EventStore Streaming Summary ────────────────────────────────');
  console.log('| Metric               | Value                                  |');
  console.log('| -------------------- | -------------------------------------- |');
  console.log(`| Event Received       | ${eventReceived.toString().padEnd(38)} |`);
  console.log(`| Received Stage       | ${(receivedStage || 'NONE').padEnd(38)} |`);
  console.log('────────────────────────────────────────────────────────────────\n');

  if (eventReceived) {
    console.log('[PASS] EventStore streaming works.');
    process.exit(0);
  } else {
    console.error('[FAIL] EventStore streaming failed.');
    process.exit(1);
  }
}, 500);
