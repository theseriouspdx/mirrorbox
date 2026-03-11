const sandbox = require('./sandbox-manager');
const eventStore = require('../state/event-store');

async function runDryRun(projectRoot, patch, testCommand) {
  const container = await sandbox.spawn(projectRoot);
  try {
    // 1. Apply patch in sandbox
    const patchResult = await sandbox.exec(container, 'patch', ['-p1', '-i', '/project/data/last_patch.diff']);
    if (patchResult.code !== 0) throw new Error('Patch application failed in sandbox');

    // 2. Run tests with probe
    const testResult = await sandbox.exec(container, 'node', [
      '--require', '/project/src/sandbox/probe.js',
      '-e', testCommand
    ]);

    const report = {
      success: testResult.code === 0,
      stdout: testResult.stdout,
      stderr: testResult.stderr,
      containerId: container
    };

    eventStore.append('DRY_RUN_COMPLETE', 'dry-run', report, 'subject');
    return report;
  } catch (err) {
    throw err;
  } finally {
    // Section 16: Automatic teardown after task completion or failure.
    await sandbox.teardown(container);
  }
}

module.exports = { runDryRun };
