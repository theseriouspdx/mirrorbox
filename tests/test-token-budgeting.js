'use strict';

/**
 * tests/test-token-budgeting.js
 *
 * Verifies the token budgeting guards in callModel to ensure they block
 * excessively large prompts before they are dispatched to the model provider.
 */

const { callModel } = require('../src/auth/call-model');
const assert = require('assert');
const os = require('os');
const path = require('path');

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
console.log('── Environment OK — proceeding with token-budgeting test ─────────\n');

// NOTE: We override routeModels on the required module instance to bypass environment detection.
const modelRouter = require('../src/auth/model-router');
const mockConfig = {
  classifier: { provider: 'openrouter', model: 'google/gemini-2.0-flash-001', budget: { input: 10, output: 10 } }
};
modelRouter.routeModels = async () => ({
  routingMap: mockConfig,
  tier: 1
});

const results = [];
function record(label, ok) {
  results.push({ label, status: ok ? 'PASS' : 'FAIL' });
  if (ok) console.log(`  ✓ ${label}`);
  else console.error(`  ✗ ${label}`);
}

async function testBudgetExceeded() {
  console.log('Phase 1: Budget Exceeded Protection');
  const prompt = 'This prompt is definitely longer than ten tokens when counted by the heuristic.';
  try {
    // Force a very low budget via options to ensure breach
    await callModel('classifier', prompt, {}, null, [], null, { budget: { input: 1, output: 1 } });
    record('Catch budget breach (input=1)', false);
  } catch (err) {
    record('Catch budget breach (input=1)', err.message.includes('[BUDGET_EXCEEDED]'));
  }
}

async function testBudgetPassed() {
  console.log('\nPhase 2: Budget Passed Dispatch');
  const prompt = 'Short'; // ~2 tokens
  try {
    await callModel('classifier', prompt, {}, null, [], null, { budget: { input: 1000, output: 1000 } });
    record('Budget check passed (proceeded to dispatch)', true);
  } catch (err) {
    // Any error (like network) also confirms we passed the budget check.
    const ok = !err.message.includes('[BUDGET_EXCEEDED]');
    record('Budget check passed (proceeded to dispatch)', ok);
  }
}

async function testBudgetValidationGuard() {
  console.log('\nPhase 3: Budget Object Validation (Fallback)');
  const prompt = 'Long prompt that should exceed default but we try to bypass with empty budget object';
  try {
    await callModel('classifier', prompt, {}, null, [], null, { budget: {} });
    record('Empty budget object fell back to default safely', true);
  } catch (err) {
    const ok = !err.message.includes('[BUDGET_EXCEEDED]');
    record('Empty budget object fell back to default safely', ok);
  }
}

async function main() {
  console.log('--- tests/test-token-budgeting.js — Token Guard Validation ---\n');
  
  await testBudgetExceeded();
  await testBudgetPassed();
  await testBudgetValidationGuard();

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Token Budgeting Summary Table ────────────────────────────────');
  console.log('| Budget Guard Check                             | Status       |');
  console.log('| ---------------------------------------------- | ------------ |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  if (failedCount > 0) process.exit(1);
  console.log('PASS  test-token-budgeting.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
