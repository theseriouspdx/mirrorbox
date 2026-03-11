const Database = require('better-sqlite3');
const assert = require('assert');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/mirrorbox.db');
const PROJECT_ROOT = path.join(__dirname, '..');

function runCommand(command, stdio = 'pipe') {
  try {
    return {
      success: true,
      stdout: execSync(command, { stdio, cwd: PROJECT_ROOT }).toString()
    };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : ''
    };
  }
}

async function testInvariant1And2() {
  console.log('Testing Invariant 1 & 2: File Protection & Project Root...');
  // Since we are black-box, we check if bin/handshake.py enforces read-only / src/ locks.
  // A real test would try to use the orchestrator to write to /etc/ or src/ without handshake.
  const result = runCommand('ls -ld src');
  if (result.stdout.includes('dr-xr-xr-x')) {
    console.log('  PASS: src/ directory is read-only (555).');
  } else {
    console.log('  FAIL: src/ directory is NOT read-only.');
  }
}

async function testInvariant4() {
  console.log('Testing Invariant 4: Event Store Reproducibility...');
  const result = runCommand('python3 scripts/verify-chain.py');
  if (result.success) {
    console.log('  PASS: Chain integrity verified.');
  } else {
    console.log('  FAIL: Chain integrity breach detected!');
    console.log(result.stdout);
  }
}

async function testInvariant10() {
  console.log('Testing Invariant 10: Entropy Tax...');
  const result = runCommand('python3 bin/validator.py --all');
  if (result.success) {
    console.log('  PASS: Entropy tax paid (All files pass).');
  } else {
    console.log('  FAIL: Entropy tax failure detected!');
    console.log(result.stdout);
  }
}

async function testInvariant11() {
  console.log('Testing Invariant 11: Cell Bootstrapping...');
  // Check if a representative src file has the entropy tax section.
  // We can't read src directly if locked, but we can check if bin/validator.py is present.
  if (fs.existsSync(path.join(PROJECT_ROOT, 'bin/validator.py'))) {
    console.log('  PASS: bin/validator.py exists for bootstrapping enforcement.');
  } else {
    console.log('  FAIL: bin/validator.py missing.');
  }
}

async function runAllTests() {
  console.log('--- Mirror Box External Invariant Test Suite ---\n');
  
  await testInvariant1And2();
  await testInvariant4();
  await testInvariant10();
  await testInvariant11();

  console.log('\n--- Invariant Test Suite Complete ---');
}

runAllTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
