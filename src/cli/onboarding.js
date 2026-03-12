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
  const { version } = require('../../package.json');

  /**
   * Section 29: Tokenmiser Onboarding
   * Performs initial repo scan to capture the "Immutable Baseline".
   */
  async function runOnboarding(projectRoot, priorData = null) {
    const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
    console.log(`[Tokenmiser] Scanning project baseline: ${projectRoot}...`);

    const stats = scanProject(projectRoot);

    const onboardingData = {
      onboardingVersion: version,
      primeDirective: priorData ? priorData.primeDirective : "Mirror Box Orchestrator — Default Prime Directive",
      createdAt: priorData ? priorData.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      baseline: {
        tokenCountRaw: stats.tokenCountRaw,
        fileCount: stats.fileCount,
        timestamp: new Date().toISOString()
      }
    };

    fs.writeFileSync(onboardingPath, JSON.stringify(onboardingData, null, 2), 'utf8');
    console.log(`[Tokenmiser] Baseline captured: ${stats.tokenCountRaw} tokens across ${stats.fileCount} files.`);
  }

  /**
   * Heuristic scan respecting .gitignore patterns (simplified).
   */
  function scanProject(root) {
    let tokenCountRaw = 0;
    let fileCount = 0;

    const ignored = ['.git', 'node_modules', '.mbo', 'data', 'audit', 'dist', 'build'];

    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignored.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const ext = path.extname(entry.name).toLowerCase();
            const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.gz', '.db', '.sqlite'];
            if (binaryExts.includes(ext)) continue;

            const content = fs.readFileSync(fullPath, 'utf8');
            tokenCountRaw += Math.ceil(content.length / 4);
            fileCount++;
          } catch (_) {
            // Skip unreadable or non-text files
          }
        }

      }
    }

    walk(root);
    return { tokenCountRaw, fileCount };
  }

}

module.exports = { checkOnboarding };
