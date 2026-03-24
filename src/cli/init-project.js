/**
 * src/cli/init-project.js — MBO Project Scaffolding & Git Integration
 * Initializes .mbo/ directory and automates .gitignore per Section 28.3 & 28.4.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GOVERNANCE_DEFAULTS = {
  'projecttracking.md': [
    '# projecttracking.md',
    '## Mirror Box Orchestrator — Canonical Task Ledger',
    '',
    '**Current Milestone:** 0.1 — Bootstrap [READY]',
    '**Current Version:** 0.1.00',
    '**Next Task:** v0.1.01',
    '**Policy:** This file is the single source of truth for work state.',
    '',
    '---',
    '',
    '## Active Tasks',
    '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |',
    '|---|---|---|---|---|---|---|---|---|',
    '| v0.1.01 | docs | Bootstrap governance ledger | READY | unassigned | - | 2026-03-21 | - | Governance docs exist and can be updated in-place |',
    '',
    '---',
    '',
    '## Recently Completed',
    '| Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |',
    '|---|---|---|---|---|---|---|---|---|',
  ].join('\n') + '\n',
  'BUGS.md': [
    '## Mirror Box Orchestrator — Outstanding Bugs',
    '',
    '**Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.',
    '**Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).',
    '**Next bug number:** BUG-001',
    '',
    '---',
    '(No outstanding P0/P1 bugs)',
  ].join('\n') + '\n',
  'BUGS-resolved.md': [
    '# BUGS-resolved.md — Mirror Box Orchestrator',
    '# Archive of resolved, completed, superseded, and fixed bugs.',
    '# Reference only. Do not edit or re-open here — log new bugs in BUGS.md.',
    '',
    '---',
  ].join('\n') + '\n',
  'CHANGELOG.md': [
    '# CHANGELOG.md',
    '## [0.1.00] — 2026-03-21 — Governance Bootstrap',
    '### Added',
    '- Seeded governance documents during onboarding for projects that did not already have them.',
  ].join('\n') + '\n',
};

function ensureRuntimeGovernanceFiles(governanceDir) {
  Object.entries(GOVERNANCE_DEFAULTS).forEach(([name, content]) => {
    const target = path.join(governanceDir, name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, content, 'utf8');
    }
  });
}

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
  const governanceDir = path.join(mboDir, 'governance');
  const homeConfigPath = path.join(require('os').homedir(), '.mbo', 'config.json');
  const localConfigPath = path.join(mboDir, 'config.json');
  const dirs = [
    mboDir,
    governanceDir,
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
    'AGENTS.md':    '# AGENTS.md\n## Project-Specific Agent Rules\n'
  };

  Object.entries(files).forEach(([name, content]) => {
    const filePath = path.join(mboDir, name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  });

  ensureRuntimeGovernanceFiles(governanceDir);

  // BUG-168: ensure a local runtime config exists so startup paths are deterministic.
  if (!fs.existsSync(localConfigPath)) {
    let seeded = {};
    try {
      if (fs.existsSync(homeConfigPath)) {
        seeded = JSON.parse(fs.readFileSync(homeConfigPath, 'utf8'));
      }
    } catch {
      seeded = {};
    }

    if (!Array.isArray(seeded.scanRoots) || seeded.scanRoots.length === 0) {
      seeded.scanRoots = ['src'];
    }

    if (!Array.isArray(seeded.mcpClients) || seeded.mcpClients.length === 0) {
      seeded.mcpClients = [{ name: 'claude', configPath: '.mcp.json' }];
    }

    seeded.updatedAt = new Date().toISOString();
    fs.writeFileSync(localConfigPath, JSON.stringify(seeded, null, 2), 'utf8');
  }

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
