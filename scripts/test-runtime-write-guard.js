'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// MBO_ROOT is the real controller root — derive it from __dirname (scripts/)
const MBO_ROOT = path.resolve(__dirname, '..');
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-runtime-guard-'));
fs.mkdirSync(path.join(runtimeRoot, '.mbo'), { recursive: true });

process.env.MBO_PROJECT_ROOT = runtimeRoot;

const { Operator } = require('../src/auth/operator');

(async () => {
  console.log('--- scripts/test-runtime-write-guard.js ---');
  const op = new Operator('runtime');
  
  // Build a relative path that resolves from runtimeRoot INTO MBO_ROOT/src/auth/operator.js
  // e.g. runtimeRoot = /tmp/mbo-runtime-guard-XXXX → ../../Users/johnserious/MBO/src/auth/operator.js
  const relativeTarget = path.relative(runtimeRoot, path.join(MBO_ROOT, 'src', 'auth', 'operator.js'));
  
  try {
    console.log(`Testing write guard for: ${relativeTarget}`);
    await op.runStage6('module.exports = 1;\n', [relativeTarget]);
    throw new Error('expected runtime write guard to block controller-targeted path');
  } catch (err) {
    if (/Runtime writes cannot target controller files/.test(err.message)) {
      console.log('✓ PASS: runtime write guard blocks controller file targets');
    } else {
      console.error('✗ FAIL: unexpected error message: ' + err.message);
      process.exit(1);
    }
  }

  // Cleanup
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
})();
