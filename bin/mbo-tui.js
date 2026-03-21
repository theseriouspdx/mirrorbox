#!/usr/bin/env node
/**
 * bin/mbo-tui.js — Launches the MBO Ink TUI.
 *
 * src/tui/ has its own package.json with "type":"module" so tsx compiles
 * to ESM, which lets Ink v5 / yoga-layout (top-level await) work fine
 * inside MBO's otherwise-CJS package.
 *
 * Invoked by: mbo tui
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const MBO_ROOT  = path.resolve(__dirname, '..');
const TUI_ENTRY = path.join(MBO_ROOT, 'src', 'tui', 'index.tsx');
const TSX_CFG   = path.join(MBO_ROOT, 'tsconfig.tui.json');

if (!fs.existsSync(TUI_ENTRY)) {
  process.stderr.write(`[MBO TUI] Entry point not found: ${TUI_ENTRY}\n`);
  process.exit(1);
}

// Resolve tsx binary: local → orchestrator sibling → PATH → error
function resolveTsx() {
  const candidates = [
    path.join(MBO_ROOT, 'node_modules', '.bin', 'tsx'),
    path.join(MBO_ROOT, '..', 'orchestrator', 'node_modules', '.bin', 'tsx'),
    path.join(require('os').homedir(), 'orchestrator', 'node_modules', '.bin', 'tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { cmd: c, extra: [] };
  }
  // Check PATH
  const onPath = spawnSync('which', ['tsx'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) {
    return { cmd: onPath.stdout.trim(), extra: [] };
  }
  return null;
}

const resolved = resolveTsx();
if (!resolved) {
  process.stderr.write('[MBO TUI] tsx not found.\n');
  process.stderr.write('  Install it: npm install -g tsx\n');
  process.stderr.write('  Or run from orchestrator dir: cd ~/orchestrator && node ../MBO/bin/mbo-tui.js\n');
  process.exit(1);
}
const { cmd, extra } = resolved;

const child = spawn(cmd, [
  ...extra,
  '--tsconfig', TSX_CFG,
  TUI_ENTRY,
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MBO_PROJECT_ROOT: process.env.MBO_PROJECT_ROOT || process.cwd(),
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  process.stderr.write(`[MBO TUI] Launch failed: ${err.message}\n`);
  process.exit(1);
});
