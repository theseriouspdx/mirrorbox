/**
 * Verified Audit: bypass_proofs_verified.js
 * Verifies Invariant 8 holds against all previously identified bypass vectors.
 */

const { redact } = require(require('path').resolve(__dirname, '../../../src/state/redactor'));

let pass = 0;
let fail = 0;

function probe(label, input, expectsLeak) {
  const result = typeof input === 'object' ? JSON.stringify(redact(input)) : redact(input);
  const hasLeak = !result.includes('[REDACTED:');
  
  // In the verified version, we expect NO LEAKS (expectsLeak = false)
  const confirmed = hasLeak === expectsLeak;
  const status = confirmed ? (hasLeak ? 'LEAK (BAD)' : 'SAFE (GOOD)') : 'UNEXPECTED';
  
  if (hasLeak) fail++; else pass++;
  console.log(`[${status}] ${label}`);
  console.log(`  -> ${result.substring(0, 100)}\n`);
}

console.log('=== Invariant 8 Post-Fix Verification ===\n');

// All probes should now result in SAFE (hasLeak = false)
probe('Raw string at position 0 — OpenRouter',
  'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890', false);

probe('Object with apiKey (camelCase) — offset bug',
  { apiKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890' }, false);

probe('Buffer-encoded OpenRouter key',
  { key: Buffer.from('sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890') }, false);

probe('camelCase secretKey field',
  { secretKey: 'supersecretvalue12345678' }, false);

probe('snake_case api_key field — GenericSecret',
  { api_key: 'somesecretvalue12345678' }, false);

probe('Anthropic key in unlabeled message field',
  { message: 'sk-ant-api03-AAABBBCCCDDDEEEFFFGGGHHH111222333444555666' }, false);

console.log(`\n=== Results: ${fail} leak(s), ${pass} safe ===`);
if (fail > 0) {
  console.log('VERIFICATION_FAIL: Invariant 8 bypass still present.');
  process.exit(1);
} else {
  console.log('VERIFICATION_PASS: All bypass vectors closed.');
}
