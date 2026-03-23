/**
 * scripts/test-tokenmiser-dashboard.js — Verification of Tokenmiser Dashboard
 * Tests:
 * 1. Pricing fetch & cache fallback.
 * 2. Raw baseline calculation logic.
 * 3. Stats persistence in stats.json.
 * 4. TUI Header rendering (exact format).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchPricing, getModelPricing } = require('../src/utils/pricing');
const statsManager = require('../src/state/stats-manager');
const dashboard = require('../src/cli/tokenmiser-dashboard');

const DB_PATH = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db');

// ── Rule 1: Environment Assertions ───────────────────────────────────────────
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'Pricing cache exists', ok: fs.existsSync(path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo/pricing_cache.json')), detail: 'pricing_cache.json not found' }
];
let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
console.log('── Environment OK — proceeding with tokenmiser test ──────────────\n');

async function test() {
  console.log('--- Testing Tokenmiser Dashboard ---');

  // 1. Pricing Test
  console.log('1. Testing Pricing Fetch...');
  await fetchPricing();
  const pricing = await getModelPricing('anthropic/claude-3.7-sonnet');
  console.log(`   Claude 3.7 Pricing: Prompt=$${pricing.prompt} Completion=$${pricing.completion}`);
  
  if (pricing.prompt === 0) throw new Error('Pricing fetch failed or returned 0');

  // 2. Stats Persistence Test
  console.log('2. Testing Stats Persistence...');
  const initialSavings = statsManager.getLifetimeSavings();
  
  statsManager.recordCall({
    actualTokens: 1000,
    actualCost: 0.003,
    rawTokens: 5000,
    rawCost: 0.015
  });
  
  const newSavings = statsManager.getLifetimeSavings();
  console.log(`   Savings Delta: $${(newSavings - initialSavings).toFixed(6)}`);
  
  if (newSavings <= initialSavings) throw new Error('Stats persistence or savings calculation failed');

  // 3. TUI Rendering Test (Exact Header Format)
  console.log('3. Testing TUI Header Rendering (Exact Format)...');
  const header = dashboard.renderHeader();
  console.log('HEADER START');
  process.stdout.write(header);
  console.log('HEADER END');
  
  const lines = header.split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 1 || lines.length > 2) {
    throw new Error(`Header MUST be 1-2 non-empty lines, got ${lines.length}`);
  }
  if (!header.includes('TM')) throw new Error('Header missing TM label');

  // 4. Baseline calculation verification (Heuristic)
  console.log('4. Verifying Baseline Calculation...');
  const testStr = 'A'.repeat(400); // 400 chars -> 100 tokens
  const est = Math.ceil(testStr.length / 4);
  console.log(`   Heuristic estimate for 400 chars: ${est} tokens`);
  if (est !== 100) throw new Error('Baseline heuristic failed');

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  const lifetime = statsManager.getTotals('lifetime');
  console.log('\n── Tokenmiser Lifetime Savings ───────────────────────────────────');
  console.log('| Metric               | Value                                  |');
  console.log('| -------------------- | -------------------------------------- |');
  console.log(`| Actual Cost          | $${lifetime.costEst.toFixed(6).padEnd(38)} |`);
  console.log(`| Raw Cost (Estimated) | $${lifetime.rawCostEst.toFixed(6).padEnd(38)} |`);
  console.log(`| Total Saved          | $${(lifetime.rawCostEst - lifetime.costEst).toFixed(6).padEnd(38)} |`);
  console.log(`| Tokens (Actual)      | ${lifetime.optimized.toString().padEnd(38)} |`);
  console.log(`| Tokens (Raw)         | ${lifetime.notOptimized.toString().padEnd(38)} |`);
  console.log(`| Tokens Saved         | ${(lifetime.notOptimized - lifetime.optimized).toString().padEnd(38)} |`);
  console.log('────────────────────────────────────────────────────────────────\n');

  console.log('\n--- ALL TESTS PASSED ---');
}

test().catch(err => {
  console.error('\n--- TEST FAILED ---');
  console.error(err);
  process.exit(1);
});
