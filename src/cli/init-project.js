/**
 * src/cli/init-project.js — MBO Project Scaffolding & Git Integration
 * Initializes .mbo/ directory and automates .gitignore per Section 28.3 & 28.4.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GITIGNORE_BLOCK = [
  '',
  '# MBO — per-user data (not committed)',
  '.mbo/',
  '!.mbo/onboarding.json',
  '!.mbo/AGENTS.md',
  '!.mbo/BUGS.md',
  '!.mbo/CHANGELOG.md',
  '',
].join('\n');

const NEGATION_LINES = [
  '!.mbo/onboarding.json',
  '!.mbo/AGENTS.md',
  '!.mbo/BUGS.md',
  '!.mbo/CHANGELOG.md',
];

/**
 * Initialize the .mbo/ scaffolding in the project root.
 * @param {string} projectRoot — the resolved project root
 */
function initProject(projectRoot) {
  const mboDir = path.join(projectRoot, '.mbo');
  const dirs = [
    mboDir,
    path.join(mboDir, 'logs'),
    path.join(mboDir, 'sessions'),
    path.join(projectRoot, 'data')
  ];

  // Create directories
  dirs.forEach(d => {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  });

  // Create initial governance files if missing
  const files = {
    'BUGS.md':      '# BUGS.md\n## Mirror Box Orchestrator — Known Issues\n',
    'CHANGELOG.md': '# CHANGELOG.md\n## Mirror Box Orchestrator — History\n',
    'AGENTS.md':    '# AGENTS.md\n## Project-Specific Agent Rules\n'
  };

  Object.entries(files).forEach(([name, content]) => {
    const filePath = path.join(mboDir, name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  });

  // .gitignore automation and stale DB guard
  applyGitPolicy(projectRoot);
}

/**
 * Ensure .gitignore policy for .mbo and governance file negations.
 * @param {string} projectRoot
 */
function updateGitignore(projectRoot) {
  const gitIgnorePath = path.join(projectRoot, '.gitignore');
  const existing = fs.existsSync(gitIgnorePath)
    ? fs.readFileSync(gitIgnorePath, 'utf8')
    : '';
  const lines = existing.split('\n');
  const hasMboIgnore = lines.some((l) => l.trim() === '.mbo/');

  if (!hasMboIgnore) {
    const toAppend = existing.endsWith('\n') || existing === ''
      ? GITIGNORE_BLOCK
      : `\n${GITIGNORE_BLOCK}`;
    fs.writeFileSync(gitIgnorePath, existing + toAppend, 'utf8');
    return 'created';
  }

  const missing = NEGATION_LINES.filter((l) => !lines.some((line) => line.trim() === l));
  if (missing.length > 0) {
    fs.appendFileSync(gitIgnorePath, `\n${missing.join('\n')}\n`, 'utf8');
    return 'updated';
  }
  return 'unchanged';
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function isDbTracked(projectRoot) {
  try {
    execSync('git ls-files --error-unmatch .mbo/mirrorbox.db', { cwd: projectRoot, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function applyGitPolicy(projectRoot) {
  if (!isGitRepo(projectRoot)) {
    return;
  }

  updateGitignore(projectRoot);
  if (isDbTracked(projectRoot)) {
    console.warn('[MBO] WARNING: .mbo/mirrorbox.db is tracked by git.');
    console.warn('[MBO] To untrack: git rm --cached .mbo/mirrorbox.db');
  }
}

module.exports = { initProject };
