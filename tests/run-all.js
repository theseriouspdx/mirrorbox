'use strict';

/**
 * tests/run-all.js
 *
 * Orchestrates the execution of the entire MBO test suite.
 * Discovers and runs all hardened test scripts in scripts/ and tests/.
 * Results are written to .mbo/logs/test-run-<timestamp>/ after each run.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

// ── Rule 1: Environment Assertions ───────────────────────────────────────────
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` }
];
let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
console.log('── Environment OK — proceeding with full suite execution ──────────\n');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');
const LOGS_DIR = path.join(PROJECT_ROOT, '.mbo', 'logs');

function runTest(cmd, args, label) {
  console.log(`\n======================================================`);
  console.log(`▶ RUNNING: ${label}`);
  console.log(`======================================================`);

  const start = Date.now();
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MBO_PROJECT_ROOT: PROJECT_ROOT,
      MBO_SKIP_BUG_076: '1',
    }
  });
  const duration = Date.now() - start;

  return { ok: result.status === 0, duration };
}

// ── Ensure MCP server is running for this project ────────────────────────────
function ensureMcpRunning(projectRoot) {
  const manifestPaths = [
    path.join(projectRoot, '.dev', 'run', 'mcp.json'),
    path.join(projectRoot, '.mbo', 'run', 'mcp.json'),
  ];

  let port = null;
  for (const mp of manifestPaths) {
    try {
      if (fs.existsSync(mp)) {
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        if (m && m.port) { port = m.port; break; }
      }
    } catch (_) {}
  }

  if (port) {
    const ping = spawnSync('curl', ['-sS', '-m', '2', `http://127.0.0.1:${port}/health`], { encoding: 'utf8' });
    const healthy = (ping.stdout || '').includes('"status":"ok"');
    if (healthy) {
      // Also verify it's for this project
      try {
        const parsed = JSON.parse(ping.stdout);
        if (!parsed.project_root || require('path').resolve(parsed.project_root) === require('path').resolve(projectRoot)) {
          console.log(`[mbo test] MCP server healthy on port ${port} — skipping startup\n`);
          return;
        }
        console.log(`[mbo test] Server on port ${port} belongs to a different project (${parsed.project_root}) — restarting for this project\n`);
      } catch (_) {
        console.log(`[mbo test] MCP server healthy on port ${port} — skipping startup\n`);
        return;
      }
    }
  }

  console.log('[mbo test] MCP server not running for this project — starting now (mbo mcp)...\n');
  const result = spawnSync('mbo', ['mcp'], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, MBO_PROJECT_ROOT: projectRoot },
    timeout: 120000,
  });
  if (result.status !== 0) {
    console.error('[mbo test] WARNING: mbo mcp exited non-zero — test-mcp-server.js may still fail\n');
  }
}

async function main() {
  const runTs = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
  const runDir = path.join(LOGS_DIR, `test-run-${runTs}`);
  fs.mkdirSync(runDir, { recursive: true });

  console.log('--- MBO Master Test Suite Runner ---\n');

  ensureMcpRunning(PROJECT_ROOT);

  const testScripts = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => (f.startsWith('test-') || f.startsWith('verify-')) && (f.endsWith('.js') || f.endsWith('.py')))
    .map(f => ({ path: path.join(SCRIPTS_DIR, f), name: f, lang: f.endsWith('.py') ? 'python3' : 'node' }));

  const testDirFiles = fs.readdirSync(TESTS_DIR)
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .map(f => ({ path: path.join(TESTS_DIR, f), name: f, lang: 'node' }));

  const allTests = [...testScripts, ...testDirFiles];

  // Force test-state.js to run first to seed the DB
  allTests.sort((a, b) => (a.name === 'test-state.js' ? -1 : b.name === 'test-state.js' ? 1 : 0));

  console.log(`Found ${allTests.length} test scripts. Running sequentially...\n`);

  const startedAt = new Date().toISOString();
  const results = [];
  for (const test of allTests) {
    const { ok, duration } = runTest(test.lang, [test.path], test.name);
    results.push({ label: test.name, status: ok ? 'PASS' : 'FAIL', durationMs: duration });
  }
  const finishedAt = new Date().toISOString();

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Master Test Suite Summary Table ──────────────────────────────');
  console.log('| Test Script                                    | Status       | Duration  |');
  console.log('| ---------------------------------------------- | ------------ | --------- |');
  for (const res of results) {
    const dur = `${res.durationMs}ms`;
    console.log(`| ${res.label.padEnd(46)} | ${res.status.padEnd(12)} | ${dur.padEnd(9)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  const failedCount = results.filter(r => r.status === 'FAIL').length;
  const passedCount = results.length - failedCount;
  const verdict = failedCount > 0 ? 'FAIL' : 'PASS';

  // ── Write results to .mbo/logs/test-run-<timestamp>/ ─────────────────────
  const summary = {
    generatedAt: finishedAt,
    startedAt,
    projectRoot: PROJECT_ROOT,
    runDir,
    verdict,
    totals: { total: results.length, passed: passedCount, failed: failedCount },
    results,
  };
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Build a human-readable markdown report
  const mdLines = [
    `# MBO Test Run — ${runTs}`,
    ``,
    `- **Verdict:** ${verdict}`,
    `- **Started:** ${startedAt}`,
    `- **Finished:** ${finishedAt}`,
    `- **Totals:** ${passedCount} passed / ${failedCount} failed / ${results.length} total`,
    ``,
    `## Results`,
    ``,
    `| Test Script | Status | Duration |`,
    `| --- | --- | --- |`,
    ...results.map(r => `| ${r.label} | ${r.status} | ${r.durationMs}ms |`),
  ];
  if (failedCount > 0) {
    mdLines.push(``, `## Failed Tests`, ``);
    results.filter(r => r.status === 'FAIL').forEach(r => mdLines.push(`- **${r.label}**`));
  }
  fs.writeFileSync(path.join(runDir, 'results.md'), mdLines.join('\n'));

  console.log(`📄 Results saved to: ${runDir}`);

  if (failedCount > 0) {
    console.error(`\nFAIL: ${failedCount} test(s) failed.`);
    process.exit(1);
  }
  console.log('🎉 All tests passed successfully!');
}

main().catch(console.error);
