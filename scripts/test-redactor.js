const assert = require('assert');
const { redact } = require('../src/state/redactor');

function testRedactor() {
  console.log('--- Testing Redactor ---');

  // 1. Raw string
  const rawOpenRouter = 'Here is my key: sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890';
  assert.strictEqual(
    redact(rawOpenRouter),
    'Here is my key: [REDACTED:OpenRouter]',
    'Raw string OpenRouter key should be redacted'
  );

  // 2. Object with camelCase field
  const objCamel = { openRouterKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890' };
  assert.deepStrictEqual(
    redact(objCamel),
    { openRouterKey: '[REDACTED:OpenRouter]' },
    'camelCase field should be redacted'
  );

  // 3. Object with snake_case field
  const objSnake = { github_token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' };
  assert.deepStrictEqual(
    redact(objSnake),
    { github_token: '[REDACTED:GitHub]' },
    'snake_case field should be redacted'
  );

  // 4. Buffer-encoded value (simulated by base64) - stringified buffer is just an object to JSON.stringify if not handled explicitly, but here we test general strings
  const mixedString = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz and Key: sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890';
  assert.strictEqual(
    redact(mixedString),
    'Token: [REDACTED:GitHub] and Key: [REDACTED:OpenRouter]',
    'Multiple secrets in one string should be redacted'
  );

  // 5. Nested object
  const nestedObj = { config: { auth: { token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' } } };
  assert.deepStrictEqual(
    redact(nestedObj),
    { config: { auth: { token: '[REDACTED:GitHub]' } } },
    'Nested object field should be redacted'
  );

  // 6. Generic Secret Match
  const genericSecret = '{"api_key": "my-super-secret-key-123"}';
  assert.strictEqual(
    redact(genericSecret),
    '{"api_key": "[REDACTED:GenericSecret]"}',
    'Generic secret key-value should be redacted'
  );

  console.log('PASS: All redactor tests passed.');
}

testRedactor();
