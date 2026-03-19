#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mktempProject(prefix = 'mbo-bug-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, '.mbo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'tmp', version: '0.0.0' }, null, 2));
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'module.exports = 1;\n');
  return root;
}

async function testBug086LegacyProfileWithoutRootTriggersDrift() {
  const { checkOnboarding } = require('../src/cli/onboarding');
  const projectRoot = mktempProject('mbo-bug086-');

  // Simulates pre-fix copied profile: no projectRoot field.
  const legacyProfile = {
    primeDirective: 'keep auth stable',
    users: 'internal',
    onboardingVersion: 1,
    binaryVersion: '0.11.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(projectRoot, '.mbo', 'onboarding.json'),
    JSON.stringify(legacyProfile, null, 2) + '\n',
    'utf8'
  );

  const status = await checkOnboarding(projectRoot, { autoRun: false, returnStatus: true });
  assert(status.needsOnboarding === true, 'BUG-086: legacy copied profile should force re-onboarding');
  assert(status.reason === 'profile_drift', `BUG-086: expected profile_drift, got ${status.reason}`);
}

async function testBug149LiveInterviewPathUsesCallModelAndPersists() {
  // Patch callModel before loading onboarding module so runOnboarding uses mock provider.
  const callModelModule = require('../src/auth/call-model');
  const originalCallModel = callModelModule.callModel;

  let calls = 0;
  callModelModule.callModel = async (_role, _prompt) => {
    calls += 1;
    if (calls === 1) {
      return 'What is your top priority for this project?';
    }
    return [
      '---WORKING AGREEMENT---',
      'prime_directive: Keep auth stable',
      'project_type: existing',
      'users: internal developers',
      'deployment_target: unknown',
      'staging_path: internal',
      'verification_commands: npm test',
      'danger_zones: src/auth',
      'real_constraints: none',
      'partnership: proactive architect',
      '---END---',
    ].join('\n');
  };

  // Freshly require onboarding after monkeypatch is applied.
  delete require.cache[require.resolve('../src/cli/onboarding')];
  const { runOnboarding } = require('../src/cli/onboarding');

  const projectRoot = mktempProject('mbo-bug149-');

  const answers = ['Security first', 'Accept'];
  let idx = 0;
  const io = {
    ask: async (_prompt, def = '') => (idx < answers.length ? answers[idx++] : def || ''),
    close: () => {},
  };

  try {
    const profile = await runOnboarding(projectRoot, null, { nonInteractive: false }, io);
    assert(calls >= 2, 'BUG-149: live interview path must call callModel');
    assert(profile && profile.primeDirective, 'BUG-149: runOnboarding should return persisted profile');

    const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
    assert(fs.existsSync(onboardingPath), 'BUG-149: onboarding.json should be written');
    const persisted = JSON.parse(fs.readFileSync(onboardingPath, 'utf8'));
    assert(persisted.primeDirective === 'Keep auth stable', 'BUG-149: persisted prime directive mismatch');
  } finally {
    // Restore module state for any subsequent tests.
    callModelModule.callModel = originalCallModel;
  }
}

async function main() {
  console.log('--- test-bug-086-149.js ---\n');
  await testBug086LegacyProfileWithoutRootTriggersDrift();
  console.log('PASS  BUG-086 legacy profile without projectRoot triggers profile_drift');
  await testBug149LiveInterviewPathUsesCallModelAndPersists();
  console.log('PASS  BUG-149 live interview path exercised with mock provider and persistence');
  console.log('\nPASS  all bug regression checks');
}

main().catch((err) => {
  console.error('\nFAIL test-bug-086-149.js:', err.message);
  process.exit(1);
});
