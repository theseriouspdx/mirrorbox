#!/usr/bin/env node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runOnboarding, validateProfile, readLatestDbProfile } = require('../src/cli/onboarding');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function mktempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-onboard-'));
  fs.mkdirSync(path.join(root, '.mbo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'tmp-project',
    scripts: { test: 'node -e "process.exit(0)"' },
    dependencies: { express: '^5.0.0' }
  }, null, 2));
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'index.js'), 'module.exports = 42;\n');
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tests', 'index.test.js'), 'test("ok", ()=>{});\n');
  return root;
}

async function testFreshOnboarding() {
  const projectRoot = mktempProject();
  const subjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-subject-'));

  const profile = await runOnboarding(projectRoot, null, {
    nonInteractive: true,
    answers: {
      projectType: 'existing',
      users: 'internal devs',
      q3Raw: 'keep deployment stable',
      q4Raw: 'document risky changes',
    },
    followup: {
      subjectRoot,
      verificationCommands: 'npm test',
      dangerZones: 'lib/index.js',
      realConstraints: 'deployment stability',
      assumedConstraints: 'legacy build server',
      canonicalConfigPath: 'package.json',
    },
  });

  const v = validateProfile(profile);
  assert(v.complete, `fresh onboarding should be complete, missing: ${v.missing.join(', ')}`);

  const filePath = path.join(projectRoot, '.mbo', 'onboarding.json');
  assert(fs.existsSync(filePath), 'onboarding.json must exist');
  const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert(fileData.subjectRoot === subjectRoot, 'onboarding.json subjectRoot mismatch');

  const dbProfile = readLatestDbProfile(projectRoot);
  assert(dbProfile && dbProfile.profile, 'DB profile must exist');
  assert(dbProfile.profile.subjectRoot === subjectRoot, 'DB subjectRoot mismatch');
  assert(dbProfile.profile.binaryVersion, 'DB binaryVersion missing');

  return { projectRoot, subjectRoot, onboardingVersion: profile.onboardingVersion };
}

async function testReonboardAdditive() {
  const projectRoot = mktempProject();
  const subjectRoot1 = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-subject-a-'));
  const subjectRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-subject-b-'));

  const first = await runOnboarding(projectRoot, null, {
    nonInteractive: true,
    answers: {
      projectType: 'existing',
      users: 'ops',
      q3Raw: 'do not break auth',
      q4Raw: 'keep logs clear',
    },
    followup: {
      subjectRoot: subjectRoot1,
      dangerZones: 'auth.js',
      verificationCommands: 'npm test',
      realConstraints: 'auth stability',
      assumedConstraints: 'infra freeze',
    },
  });

  const second = await runOnboarding(projectRoot, first, {
    nonInteractive: true,
    answers: {
      projectType: 'existing',
      users: 'ops+support',
      q3Raw: 'do not break auth',
      q4Raw: 'keep logs clear and actionable',
    },
    followup: {
      subjectRoot: subjectRoot2,
      dangerZones: 'auth.js,session.js',
      verificationCommands: 'npm test,npm run lint',
      realConstraints: 'auth stability',
      assumedConstraints: 'infra freeze',
      migrationPolicy: 'backward compatible',
    },
  });

  assert(second.onboardingVersion === first.onboardingVersion + 1, 'onboardingVersion should increment additively');
  assert(second.subjectRoot === subjectRoot2, 'subjectRoot should update on re-onboard');
  assert(second.projectNotes && second.projectNotes.scanSummary, 'scan summary should be preserved in projectNotes');

  const dbProfile = readLatestDbProfile(projectRoot);
  assert(dbProfile.profile.onboardingVersion === second.onboardingVersion, 'DB should store latest onboarding version');
}

async function main() {
  console.log('--- test-onboarding.js ---');
  await testFreshOnboarding();
  console.log('PASS fresh onboarding');
  await testReonboardAdditive();
  console.log('PASS re-onboard additive');
  console.log('PASS all onboarding tests');
}

main().catch((err) => {
  console.error('FAIL test-onboarding.js:', err.message);
  process.exit(1);
});
