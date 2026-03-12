#!/usr/bin/env node
/**
 * bin/mbo.js — MBO global CLI entrypoint
 * Registered as both 'mbo' and 'mboalpha' in package.json bin field.
 * Delegates to src/index.js. Runs from process.cwd() (the project root).
 *
 * Install: npm install -g .
 * Usage:   mbo (from any project directory)
 */

'use strict';

const path = require('path');
const { spawn } = require('child_process');

const entry = path.join(__dirname, '..', 'src', 'index.js');

if (process.argv[2] === 'setup') {
  require('../src/cli/setup').runSetup().catch(err => { console.error(err); process.exit(1); });
} else {
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
