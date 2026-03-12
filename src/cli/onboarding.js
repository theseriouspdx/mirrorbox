/**
 * src/cli/onboarding.js — MBO Project Onboarding
 * Checks onboarding status and versioning per Section 28.5.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { version } = require('../../package.json');

/**
 * Check if the project needs onboarding or re-onboarding.
 * @param {string} projectRoot
 * @returns {Promise<boolean>} — true if onboarding is needed or was run
 */
async function checkOnboarding(projectRoot) {
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  
  if (!fs.existsSync(onboardingPath)) {
    if (process.stdout.isTTY) await runOnboarding(projectRoot);
    return true;
  }

  try {
    const raw = fs.readFileSync(onboardingPath, 'utf8');
    const data = JSON.parse(raw);
    
    // §28.5 Step 6: Trigger re-onboard on version mismatch
    if (data.onboardingVersion !== version) {
      console.log(`[SYSTEM] Version mismatch (${data.onboardingVersion} vs ${version}). Triggering re-onboard...`);
      if (process.stdout.isTTY) await runOnboarding(projectRoot, data);
      return true;
    }
  } catch (err) {
    console.error(`[WARN] onboarding.json corrupt: ${err.message}. Re-running...`);
    if (process.stdout.isTTY) await runOnboarding(projectRoot);
    return true;
  }
  return false;
}

/**
 * Placeholder for the actual Tokenizer onboarding interview (Task 1.1-07).
 * @param {string} projectRoot
 * @param {object} priorData
 */
async function runOnboarding(projectRoot, priorData = null) {
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  
  // For now, write a minimal placeholder onboarding.json
  const onboardingData = {
    onboardingVersion: version,
    primeDirective: priorData ? priorData.primeDirective : "Mirror Box Orchestrator — Default Prime Directive",
    createdAt: priorData ? priorData.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(onboardingPath, JSON.stringify(onboardingData, null, 2), 'utf8');
  console.log(`[SYSTEM] Onboarding initialized at ${onboardingPath}`);
}

module.exports = { checkOnboarding };
