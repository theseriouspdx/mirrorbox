'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

function detectShell() {
  const shell = process.env.SHELL || '';
  return shell.includes('zsh')
    ? path.join(os.homedir(), '.zshrc')
    : path.join(os.homedir(), '.bashrc');
}

function appendExportIfMissing(profilePath, key, value) {
  try {
    let existing = '';
    try { existing = fs.readFileSync(profilePath, 'utf8'); } catch { existing = ''; }
    if (existing.includes(`export ${key}=`)) return;
    fs.appendFileSync(profilePath, `\nexport ${key}="${value}"\n`, 'utf8');
  } catch {
    // non-fatal — user can set it manually
  }
}

module.exports = { detectShell, appendExportIfMissing };
