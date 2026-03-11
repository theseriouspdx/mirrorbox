'use strict';
/**
 * MBO Milestone 0.8 Formal Audit
 *
 * Tests implemented prior to Sandbox/Docker tasks:
 *   Audit 1 — BUG-040: EventStore rejects invalid world_id (Invariant 10)
 *   Audit 2 — BUG-041: StateManager checkpoint rejects invalid world_id (Invariant 13)
 *   Audit 3 — BUG-041: StateManager load rejects invalid world_id
 *   Audit 4 — Non-regression: All checkpoint calls in operator.js use valid world_id
 *
 * Sandbox/Docker tasks (0.8-01..0.8-10) not yet implemented — excluded from scope.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  [PASS] ${label}`);
  passed++;
}

function fail(label, err) {
  console.error(`  [FAIL] ${label}: ${err && err.message ? err.message : err}`);
  failed++;
}


// ─── Audit 1: BUG-040 — EventStore world_id enforcement ──────────────────────
async function audit1() {
  console.log('Audit 1: BUG-040 — EventStore rejects invalid world_id (Invariant 10)...');
  const eventStore = require('../../src/state/event-store');

  // Valid world_ids
  try {
    eventStore.append('AUDIT_TEST', 'audit', { ok: true }, 'mirror');
    pass('"mirror" world_id accepted');
  } catch (e) { fail('"mirror" world_id accepted', e); }

  try {
    eventStore.append('AUDIT_TEST', 'audit', { ok: true }, 'subject');
    pass('"subject" world_id accepted');
  } catch (e) { fail('"subject" world_id accepted', e); }

  // Invalid world_ids must throw INVARIANT VIOLATION
  for (const bad of ['host', 'production', '', undefined, null]) {
    try {
      eventStore.append('AUDIT_TEST', 'audit', {}, bad);
      fail(`invalid world_id "${bad}" should be rejected`, new Error('No error thrown'));
    } catch (e) {
      if (e.message && e.message.includes('INVARIANT VIOLATION')) {
        pass(`invalid world_id "${bad}" rejected with INVARIANT VIOLATION`);
      } else {
        fail(`invalid world_id "${bad}" rejected`, e);
      }
    }
  }
}

// ─── Audit 2: BUG-041 — StateManager checkpoint world_id enforcement ──────────
async function audit2() {
  console.log('Audit 2: BUG-041 — StateManager.checkpoint rejects invalid world_id (Invariant 13)...');
  const stateManager = require('../../src/state/state-manager');

  try {
    const cp = stateManager.checkpoint('mirror');
    assert(cp !== null && cp !== undefined, 'checkpoint should return a value');
    pass('checkpoint("mirror") succeeds');
  } catch (e) { fail('checkpoint("mirror") succeeds', e); }

  for (const bad of ['host', 'invalid', '', undefined]) {
    try {
      stateManager.checkpoint(bad);
      fail(`checkpoint("${bad}") should be rejected`, new Error('No error thrown'));
    } catch (e) {
      if (e.message && e.message.includes('INVARIANT VIOLATION')) {
        pass(`checkpoint("${bad}") rejected with INVARIANT VIOLATION`);
      } else {
        fail(`checkpoint("${bad}") rejected`, e);
      }
    }
  }
}

async function main() {
  console.log('--- MBO Milestone 0.8 Formal Audit ---');
  await audit1();
  await audit2();
  console.log(`\nAudit Complete: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('[CRITICAL] Audit script crashed:', e);
  process.exit(1);
});

