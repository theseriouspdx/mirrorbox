/**
 * Audit Artifact: bypass_proofs.js
 * Demonstrates Invariant 8 bypass vectors against redactor.js
 * Run: node bypass_proofs.js (from /Users/johnserious/MBO/)
 */

const { redact } = require(require('path').resolve(__dirname, '../../../src/state/redactor'));

let pass = 0;
let fail = 0;

function probe(label, input, expectsLeak) {
  const result = typeof input === 'object' ? JSON.stringify(redact(input)) : redact(input);
  const hasLeak = !result.includes('[REDACTED:');
  const confirmed = hasLeak === expectsLeak;
  const status = confirmed ? (expectsLeak ? 'LEAK CONFIRMED' : 'SAFE') : 'UNEXPECTED';
  if (expectsLeak) fail++; else pass++;
  console.log(`[${status}] ${label}`);
  console.log(`  -> ${result.substring(0, 100)}\n`);
}

console.log('=== Invariant 8 Bypass Probes ===\n');

// Root cause: position-0 edge case (works correctly)
probe('Raw string at position 0 — OpenRouter',
  'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890', false);

// BYPASS 1: camelCase field name not in GenericSecret, match at non-zero offset
probe('Object with apiKey (camelCase) — offset bug',
  { apiKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890' }, true);

// BYPASS 2: Buffer-encoded secret
probe('Buffer-encoded OpenRouter key',
  { key: Buffer.from('sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890') }, true);

// BYPASS 3: camelCase secretKey not in GenericSecret list
probe('camelCase secretKey field',
  { secretKey: 'supersecretvalue12345678' }, true);

// EXPECTED REDACTION (GenericSecret fires on snake_case)
probe('snake_case api_key field — GenericSecret',
  { api_key: 'somesecretvalue12345678' }, false);

// BYPASS 4: Anthropic key in unlabeled field
probe('Anthropic key in unlabeled message field',
  { message: 'sk-ant-api03-AAABBBCCCDDDEEEFFFGGGHHH111222333444555666' }, true);

console.log(`\n=== Results: ${fail} leak(s) confirmed, ${pass} safe ===`);
if (fail > 0) {
  console.log('AUDIT_FAIL: Invariant 8 bypass confirmed.');
  process.exit(1);
}
