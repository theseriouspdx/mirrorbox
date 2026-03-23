'use strict';

const { redact } = require('../src/state/redactor');
const os = require('os');
const assert = require('assert');

/**
 * Section 7: Redactor Verification Suite v2
 * Verifies Invariant 8: Secrets never enter the persistent state.
 * Required for Milestone 0.3 Final Closure.
 */

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
console.log('── Environment OK — proceeding with redactor test ────────────────\n');

const probes = [
  { 
    label: 'Raw string OpenRouter', 
    input: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890',
    verify: (res) => res === '[REDACTED:OpenRouter]'
  },
  { 
    label: 'Raw string Anthropic (sk-ant-api03-*)', 
    input: 'sk-ant-api03-AAABBBCCCDDDEEEFFFGGGHHH111222333444555666',
    verify: (res) => res === '[REDACTED:Anthropic]'
  },
  { 
    label: 'Object with camelCase apiKey', 
    input: { apiKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890' },
    verify: (res) => res.apiKey === '[REDACTED:OpenRouter]'
  },
  { 
    label: 'Object with secretKey', 
    input: { secretKey: 'supersecretvalue12345678' },
    verify: (res) => res.secretKey === '[REDACTED:GenericSecret]'
  },
  { 
    label: 'Buffer-encoded key value', 
    input: { key: Buffer.from('sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890') },
    verify: (res) => res.key === '[REDACTED:OpenRouter]'
  },
  { 
    label: 'Nested object', 
    input: { user: { profile: { token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' } } },
    verify: (res) => res.user.profile.token === '[REDACTED:GitHub]'
  },
  { 
    label: 'Multiple secrets in one string', 
    input: 'OpenRouter: sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890 and Slack: xoxb-123456789012-abcdefghijklmnopqrstuvwxyz',
    verify: (res) => res.includes('[REDACTED:OpenRouter]') && res.includes('[REDACTED:Slack]')
  },
  { 
    label: 'Clean object (must pass through unmodified)', 
    input: { message: 'Hello world', code: 200 },
    verify: (res) => res.message === 'Hello world' && res.code === 200
  },
  { 
    label: 'String at position 0 (offset regression check)', 
    input: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890 is at start',
    verify: (res) => res.startsWith('[REDACTED:OpenRouter]')
  }
];

let errors = 0;
const results = [];

console.log('--- Mirror Box Redactor Verification v2 ---');

probes.forEach(({ label, input, verify }) => {
  try {
    const result = redact(input);
    const passed = verify(result);
    results.push({ label, status: passed ? 'PASS' : 'FAIL' });
    if (passed) {
      console.log(`[PASS] ${label}`);
    } else {
      console.log(`[FAIL] ${label}`);
      console.log(`  -> Actual: ${JSON.stringify(result)}`);
      errors++;
    }
  } catch (error) {
    console.error(`[ERROR] ${label}: ${error.message}`);
    results.push({ label, status: 'ERROR' });
    errors++;
  }
});

// ── Rule 5: Live Output Table ────────────────────────────────────────────────
console.log('\n── Redactor Probe Summary ──────────────────────────────────────');
console.log('| Probe Label                                    | Status       |');
console.log('| ---------------------------------------------- | ------------ |');
for (const res of results) {
  console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} |`);
}
console.log('────────────────────────────────────────────────────────────────\n');

if (errors === 0) {
  console.log('\nVERIFICATION_PASS: All Invariant 8 bypass vectors closed.');
} else {
  console.error(`\nVERIFICATION_FAIL: ${errors} test(s) failed.`);
  process.exit(1);
}
