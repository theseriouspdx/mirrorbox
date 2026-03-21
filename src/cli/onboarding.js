/**
 * src/cli/onboarding.js — MBO Conversational Onboarding v3 (Section 36)
 *
 * This is a thin shell around the 'onboarding' advisor persona.
 * The conversation logic, corrections, and Prime Directive synthesis
 * are handled by the LLM. The code provides the plumbing:
 *   - Phase 2: Deterministic Scan & Structured Briefing
 *   - Phase 3 & 4: LLM-led Interview and Working Agreement
 *   - Phase 5: Atomic Validation & Persistence
 *
 * Binding contract: SPEC Section 36.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { version } = require('../../package.json');
const { DBManager } = require('../state/db-manager');
const { callModel } = require('../auth/call-model');

const DEFAULT_GOVERNANCE_SPEC = [
  '# SPEC.md',
  '## Mirror Box Orchestrator — Project Spec',
  '',
  '### 1. Project Identity',
  '- Prime directive: to be established during onboarding.',
  '- Primary users: unknown.',
  '- Deployment target: unknown.',
  '',
  '### 2. Safety & Governance',
  '- Governance docs live in `.dev/governance/` and are the canonical project ledger.',
  '- Prompt agents may classify, plan, review, and draft only.',
  '- CLI/tool execution owns filesystem mutation, command execution, validation, and persistence.',
  '',
  '### 3. Verification',
  '- Verification commands: to be supplied during onboarding.',
  '- Danger zones: to be supplied during onboarding.',
  '',
  '### 4. Active Work Contract',
  '- Keep this spec updated when project goals or safety constraints change.',
].join('\n') + '\n';

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  TEAL: '\x1b[36m',
  GREY: '\x1b[90m',
  RESET: '\x1b[0m',
};

function selfRunPromptPrefix() {
  if (process.env.MBO_SELF_RUN_WARNING !== '1') return '';
  const controller = process.env.MBO_SELF_RUN_WARNING_CONTROLLER || process.cwd();
  return `\x1b[31m[MBO WARNING] MBO SHOULD NOT BE RUN FROM THE MBO DIRECTORY.\n[MBO WARNING] Controller: ${controller}\x1b[0m\n`;
}

// ─── TTY / IO ─────────────────────────────────────────────────────────────────

function isTTY() {
  return !!(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * createPromptIO — wraps readline with:
 *   - Teal question coloring / Grey default coloring (BUG-119)
 *   - MBO <version> > prompt prefix
 *   - process.stdin.resume() on close to keep event loop alive
 */
function createPromptIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (prompt, defaultValue = '', helpText = '') => {
    return new Promise((resolve) => {
      const displayDefault = defaultValue ? `${C.GREY}(${defaultValue})${C.RESET}` : '';
      const doAsk = () => {
        process.stdout.write(`\n${C.TEAL}${prompt}${C.RESET}${displayDefault ? ' ' + displayDefault : ''}\n`);
        rl.question(`${selfRunPromptPrefix()}MBO ${version} > `, (answer) => {
          const trimmed = String(answer || '').trim();
          if (trimmed === '?' || trimmed.toLowerCase() === 'help') {
            if (helpText) {
              console.log(`\n${C.GREY}${helpText}${C.RESET}\n`);
            } else {
              console.log('\n(No additional help available for this question.)\n');
            }
            doAsk();
            return;
          }
          resolve(trimmed || defaultValue || '');
        });
      };
      doAsk();
    });
  };

  const close = () => {
    rl.close();
    if (process.stdin.resume) process.stdin.resume();
  };

  return { ask, close };
}

// ─── Scan Logic ───────────────────────────────────────────────────────────────

function getScanRoots(projectRoot) {
  const cfgPath = path.join(projectRoot, '.mbo', 'config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (Array.isArray(cfg.scanRoots) && cfg.scanRoots.length > 0) {
      return cfg.scanRoots.map((r) => path.resolve(projectRoot, r));
    }
  } catch {}

  const candidates = ['src', 'lib', 'app', 'server', 'services', 'bin', 'scripts', 'personalities'];
  const detected = candidates
    .map((d) => path.join(projectRoot, d))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());

  return detected.length > 0 ? detected : [projectRoot];
}

function scanProject(projectRoot, onProgress = null) {
  const scanRoots = getScanRoots(projectRoot);
  const ignored = new Set(['.git', 'node_modules', '.mbo', 'data', 'audit', 'dist', 'build', '.next', '.cache', '.dev', '.junie', '.journal']);
  const langMap = new Map([
    ['.js', 'JavaScript'], ['.cjs', 'JavaScript'], ['.mjs', 'JavaScript'],
    ['.ts', 'TypeScript'], ['.tsx', 'TypeScript'],
    ['.py', 'Python'], ['.go', 'Go'], ['.rs', 'Rust'],
    ['.java', 'Java'], ['.rb', 'Ruby'], ['.php', 'PHP'], ['.sh', 'Shell'],
  ]);

  let fileCount = 0;
  let testFiles = 0;
  let tokenCountRaw = 0;
  const languages = new Set();
  const frameworks = new Set();

  // Detect build system and basic frameworks via manifest
  const pkgPath = path.join(projectRoot, 'package.json');
  let buildSystem = null;
  if (fs.existsSync(pkgPath)) {
    buildSystem = 'npm';
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.react) frameworks.add('React');
      if (deps.next) frameworks.add('Next.js');
      if (deps.express) frameworks.add('Express');
      if (deps.tailwind) frameworks.add('TailwindCSS');
    } catch {}
  }

  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(fullPath); continue; }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.gz', '.db', '.sqlite', '.ico', '.woff', '.woff2'];
      if (binaryExts.includes(ext)) continue;

      fileCount += 1;
      const lang = langMap.get(ext);
      if (lang) languages.add(lang);
      if (/test|spec/i.test(entry.name) || /[/\\](test|tests|__tests__)[/\\]/i.test(fullPath)) testFiles += 1;

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        tokenCountRaw += Math.ceil(content.length / 4);
      } catch {}
    }
  }

  for (const root of scanRoots) {
    if (onProgress) onProgress(path.relative(projectRoot, root) || '.');
    if (fs.existsSync(root)) walk(root);
  }

  return {
    fileCount,
    tokenCountRaw,
    testCoverage: fileCount > 0 ? testFiles / fileCount : 0,
    languages: [...languages],
    frameworks: [...frameworks],
    buildSystem,
    hasCI: fs.existsSync(path.join(projectRoot, '.github', 'workflows')) || fs.existsSync(path.join(projectRoot, '.gitlab-ci.yml')),
    scanRoots: scanRoots.map((r) => path.relative(projectRoot, r) || '.'),
  };
}

// ─── UX-022: Scan Briefing ────────────────────────────────────────────────────

function buildScanBriefing(projectRoot, scan, inferredConstraints = []) {
  const confirmed = [];
  const inferred = [];
  const unknown = [];

  if (scan.languages.length > 0) confirmed.push(`Language: ${scan.languages.join(', ')}`);
  else unknown.push('Language (no source files detected)');

  if (scan.frameworks.length > 0) confirmed.push(`Framework: ${scan.frameworks.join(', ')}`);
  else inferred.push('Framework: none detected');

  if (scan.buildSystem) confirmed.push(`Build system: ${scan.buildSystem}`);
  else unknown.push('Build system');

  if (scan.hasCI) confirmed.push('CI: detected');
  else inferred.push('CI: not found — treating as intentional until confirmed');

  if (scan.canonicalConfigPath) {
    confirmed.push(`Canonical config: ${scan.canonicalConfigPath}`);
  }

  if (typeof scan.testCoverage === 'number' && scan.testCoverage < 0.2) {
    inferred.push(`Test coverage appears low (${Math.round(scan.testCoverage * 100)}%)`);
  }

  for (const c of inferredConstraints) {
    if (c && String(c).trim()) inferred.push(String(c).trim());
  }

  confirmed.push(`Files scanned: ${scan.fileCount} (~${scan.tokenCountRaw} tokens)`);
  if (scan.fileCount === 0) {
    confirmed[confirmed.length - 1] += ` ${C.GREY}(scan root may be misconfigured — check scanRoots in .mbo/config.json)${C.RESET}`;
  }

  return { confirmed, inferred, unknown };
}

function validateVerificationCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return { ok: false, reason: 'Provide at least one verification command.' };
  }
  const bad = commands.find((cmd) => !cmd || !String(cmd).trim());
  if (bad !== undefined) {
    return { ok: false, reason: 'Verification commands cannot be empty.' };
  }
  return { ok: true };
}

function validateDangerZones(paths) {
  if (!Array.isArray(paths)) {
    return { ok: false, reason: 'Danger zones must be an array of paths.' };
  }
  const invalid = paths.find((p) => typeof p !== 'string');
  if (invalid !== undefined) {
    return { ok: false, reason: 'Danger zone paths must be strings.' };
  }
  return { ok: true };
}

function ensureSpecDoc(projectRoot) {
  const specDir = path.join(projectRoot, '.dev', 'spec');
  const specPath = path.join(specDir, 'SPEC.md');
  fs.mkdirSync(specDir, { recursive: true });
  if (!fs.existsSync(specPath)) {
    fs.writeFileSync(specPath, DEFAULT_GOVERNANCE_SPEC, 'utf8');
  }
  return specPath;
}

function updateSpecFromProfile(projectRoot, profile = {}) {
  const specPath = ensureSpecDoc(projectRoot);
  const sections = [
    '# SPEC.md',
    '## Mirror Box Orchestrator — Project Spec',
    '',
    '### 1. Project Identity',
    `- Prime directive: ${profile.primeDirective || 'unknown'}.`,
    `- Primary users: ${profile.users || 'unknown'}.`,
    `- Deployment target: ${profile.deploymentTarget || 'unknown'}.`,
    `- Project type: ${profile.projectType || 'unknown'}.`,
    '',
    '### 2. Safety & Governance',
    '- Governance docs live in `.dev/governance/` and are the canonical project ledger.',
    '- SPEC.md is the primary source of truth for project intent, constraints, and acceptance detail.',
    '- Prompt agents may classify, plan, review, and draft only.',
    '- CLI/tool execution owns filesystem mutation, command execution, validation, and persistence.',
    '',
    '### 3. Verification',
    `- Verification commands: ${(profile.verificationCommands || []).join(', ') || 'none'}.`,
    `- Danger zones: ${(profile.dangerZones || []).join(', ') || 'none'}.`,
    `- Real constraints: ${(profile.realConstraints || []).join(', ') || 'none'}.`,
    '',
    '### 4. Working Agreement',
    `- Partnership style: ${profile.q4Raw || profile.partnershipStyle || 'unspecified'}.`,
    `- Subject root: ${profile.subjectRoot || 'internal'}.`,
    `- Last updated: ${new Date().toISOString()}.`,
  ];
  fs.writeFileSync(specPath, sections.join('\n') + '\n', 'utf8');
  return specPath;
}

function ensureGovernanceDocs(projectRoot) {
  const govDir = path.join(projectRoot, '.dev', 'governance');
  fs.mkdirSync(govDir, { recursive: true });

  const defaults = {
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

  for (const [name, content] of Object.entries(defaults)) {
    const target = path.join(govDir, name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, content, 'utf8');
    }
  }
}

function printScanBriefing(briefing) {
  console.log(`\n${C.TEAL}Before questions, here is what I found from your project scan:${C.RESET}`);
  
  console.log(`\n${C.TEAL}Confirmed:${C.RESET}`);
  for (const item of briefing.confirmed) console.log(`  - ${item}`);
  
  if (briefing.inferred.length > 0) {
    console.log(`\n${C.TEAL}Inferred (please confirm):${C.RESET}`);
    for (const item of briefing.inferred) console.log(`  - ${item}`);
  }

  if (briefing.unknown.length > 0) {
    console.log(`\n${C.TEAL}Unknown (I will ask):${C.RESET}`);
    for (const item of briefing.unknown) console.log(`  - ${item}`);
  }
  console.log('');
}

// ─── Staging & Path Safety ────────────────────────────────────────────────────

function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function validateSubjectRoot(raw, projectRoot) {
  if (!raw || !String(raw).trim()) return { ok: false, reason: 'Path is empty.' };
  const expanded = expandHome(String(raw).trim());

  if (!path.isAbsolute(expanded)) {
    return { ok: false, reason: 'Path must be absolute (or start with ~).' };
  }

  const resolved = path.resolve(expanded);
  if (resolved === '/') return { ok: false, reason: 'Cannot use filesystem root "/" as staging directory.' };
  if (resolved === path.resolve(projectRoot)) return { ok: false, reason: 'Staging directory cannot be the same as the project root.' };

  if (!fs.existsSync(resolved)) return { ok: false, reason: 'does_not_exist', path: resolved };
  if (!fs.statSync(resolved).isDirectory()) return { ok: false, reason: 'not_a_directory', path: resolved };

  return { ok: true, path: resolved };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function persistProfile(projectRoot, profile) {
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  fs.mkdirSync(path.dirname(onboardingPath), { recursive: true });
  fs.writeFileSync(onboardingPath, JSON.stringify(profile, null, 2) + '\n', 'utf8');

  const db = new DBManager(path.join(projectRoot, '.mbo', 'mirrorbox.db'));
  db.run('INSERT INTO onboarding_profiles (profile_data, created_at) VALUES (?, ?)', [
    JSON.stringify(profile),
    Date.now(),
  ]);
}

// ─── Plan rendering helper (BUG-147) ─────────────────────────────────────────

/**
 * Renders a plan object as labeled plain-text sections for LLM consumption.
 * Eliminates JSON.stringify(plan) anti-pattern in operator prompts.
 * JSON is for persistence (onboarding.json, DB) — not LLM communication.
 */
function renderPlanAsText(plan) {
  if (!plan || typeof plan !== 'object') return String(plan || 'none');
  const lines = [];
  if (plan.intent)              lines.push(`INTENT:\n${plan.intent}`);
  if (plan.rationale)           lines.push(`RATIONALE:\n${plan.rationale}`);
  if (Array.isArray(plan.filesToChange) && plan.filesToChange.length)
                                lines.push(`FILES:\n${plan.filesToChange.join('\n')}`);
  if (Array.isArray(plan.invariantsPreserved) && plan.invariantsPreserved.length)
                                lines.push(`INVARIANTS:\n${plan.invariantsPreserved.join('\n')}`);
  if (Array.isArray(plan.stateTransitions) && plan.stateTransitions.length)
                                lines.push(`STATE TRANSITIONS:\n${plan.stateTransitions.join('\n')}`);
  if (plan.diff)                lines.push(`DIFF:\n${plan.diff}`);
  return lines.join('\n\n') || JSON.stringify(plan, null, 2);
}

// ─── Prior profile summary (Section 5 / UX-024) ───────────────────────────────

/**
 * Renders existing onboarding profile as a concise plain-text summary
 * for re-onboard update mode. Passed once to the LLM as stable context —
 * never grows like a raw transcript did.
 */
function buildPriorProfileSummary(profile) {
  if (!profile) return '';
  const lines = ['Existing Working Agreement (update mode — only ask about unknown or changed fields):'];
  if (profile.primeDirective)       lines.push(`  Prime Directive: ${profile.primeDirective}`);
  if (profile.projectType)          lines.push(`  Project type: ${profile.projectType}`);
  if (profile.users)                lines.push(`  Users: ${profile.users}`);
  if (profile.deploymentTarget)     lines.push(`  Deployment target: ${profile.deploymentTarget}`);
  if (profile.subjectRoot)          lines.push(`  Staging path: ${profile.subjectRoot}`);
  if (Array.isArray(profile.verificationCommands) && profile.verificationCommands.length)
    lines.push(`  Verification commands: ${profile.verificationCommands.join(', ')}`);
  if (Array.isArray(profile.dangerZones) && profile.dangerZones.length)
    lines.push(`  Danger zones: ${profile.dangerZones.join(', ')}`);
  if (Array.isArray(profile.realConstraints) && profile.realConstraints.length)
    lines.push(`  Real constraints: ${profile.realConstraints.join(', ')}`);
  return lines.join('\n');
}

// ─── Working Agreement sentinel parser ────────────────────────────────────────

const SENTINEL_START = '---WORKING AGREEMENT---';
const SENTINEL_END   = '---END---';
const MAX_INTERVIEW_TURNS = 20;

/**
 * Parses the Working Agreement sentinel block emitted by the LLM at Phase 5.
 * Returns a profile object, or null if the sentinel is absent or malformed.
 * Shell never tells the LLM to return JSON — this is the single structured
 * boundary crossing, detected by sentinel, not by JSON.parse on every turn.
 */
function parseSentinel(text) {
  const start = text.indexOf(SENTINEL_START);
  const end   = text.indexOf(SENTINEL_END, start);
  if (start === -1 || end === -1) return null;

  const block = text.slice(start + SENTINEL_START.length, end).trim();
  const profile = {};

  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key   = line.slice(0, colon).trim().toLowerCase().replace(/\s+/g, '_');
    const value = line.slice(colon + 1).trim();
    if (key && value) profile[key] = value;
  }

  // Require at minimum a prime_directive to consider the sentinel valid
  return profile.prime_directive ? profile : null;
}

// ─── Conversational Logic (The Shell) ──────────────────────────────────────────

async function runOnboarding(projectRoot, priorData = null, options = {}, io = null) {
  const currentIO = io || (options.nonInteractive ? { ask: async (_, def) => def || '', close: () => {} } : createPromptIO());
  const isUpdate = !!priorData;

  try {
    // Phase 1 & 2: Background Scan & Briefing
    process.stdout.write(`\n${C.GREY}[Scan] Scanning your codebase...${C.RESET}`);
    const scan = scanProject(projectRoot);
    process.stdout.write('\r');

    const briefing = buildScanBriefing(projectRoot, scan);

    // Section 5 / UX-024: Update mode — show existing agreement, ask if update needed
    if (isUpdate) {
      console.log(`\n${C.TEAL}Here is what we already have established:${C.RESET}\n`);
      console.log(buildPriorProfileSummary(priorData));
      console.log('');
    } else {
      printScanBriefing(briefing);
      console.log(`Welcome to Mirror Box Orchestrator v${version}`);
      console.log(`Please spend a few minutes to help us get acquainted with you and your project.
Feel free to ask for clarification on any question, or go back to a previous question, or ask for help.\n`);
    }

    // Build scan briefing as plain text — never JSON.stringify(scan)
    const scanSummary = [
      'Scan results:',
      briefing.confirmed.map(c => `  Confirmed — ${c}`).join('\n'),
      briefing.inferred.length  ? briefing.inferred.map(i  => `  Inferred — ${i}`).join('\n')  : '',
      briefing.unknown.length   ? briefing.unknown.map(u   => `  Unknown — ${u}`).join('\n')   : '',
    ].filter(Boolean).join('\n');

    const priorSummary = isUpdate ? buildPriorProfileSummary(priorData) : '';

    // Phase 3 & 4: Interview Loop
    // LLM speaks plain English throughout. No JSON per turn.
    // Shell accumulates only the current session's Q&A — not the prior profile history.
    // The prior profile is passed once as a stable summary, not grown each turn.
    let sessionTranscript = '';
    let profile = null;
    let turns = 0;

    while (turns < MAX_INTERVIEW_TURNS) {
      turns++;

      const prompt = [
        'You are conducting a conversational onboarding interview (Section 36).',
        'Speak in plain English. One question per turn. Do not ask multiple questions at once.',
        isUpdate
          ? 'This is an update session. Only ask about fields that are unknown or have changed. Do not re-ask high-confidence fields.'
          : 'This is a fresh onboarding. Work through the full interview.',
        '',
        scanSummary,
        priorSummary ? `\n${priorSummary}` : '',
        sessionTranscript ? `\nConversation so far:\n${sessionTranscript}` : '',
        '',
        'When the interview is complete and the user has accepted the Working Agreement,',
        `emit the sentinel block exactly as shown — nothing before ${SENTINEL_START}, nothing after ${SENTINEL_END} except the fields:`,
        '',
        SENTINEL_START,
        'prime_directive: <synthesized prime directive text>',
        'project_type: <value>',
        'users: <value>',
        'deployment_target: <value or unknown>',
        'staging_path: <absolute path or internal>',
        'verification_commands: <comma-separated or none>',
        'danger_zones: <comma-separated paths or none>',
        'real_constraints: <comma-separated or none>',
        'partnership: <partnership/personality note>',
        SENTINEL_END,
        '',
        'If the interview is not yet complete, ask your next single question in plain English.',
      ].filter(s => s !== null).join('\n');

      process.stdout.write(`\n${C.GREY}[Advisor] Consulting Advisor...${C.RESET}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      let response;
      try {
        response = await callModel('onboarding', prompt, {}, null, [], null, { signal: controller.signal });
        clearTimeout(timeout);
        process.stdout.write('\r' + ' '.repeat(40) + '\r');
      } catch (err) {
        clearTimeout(timeout);
        process.stdout.write('\r' + ' '.repeat(40) + '\r');
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          throw new Error('Onboarding advisor timed out after 60s. Please check your connection or model provider.');
        }
        throw err;
      }

      // Check for sentinel — Phase 5 trigger
      const parsed = parseSentinel(response);
      if (parsed) {
        // Show the Working Agreement to the user before persisting (Section 36.3)
        console.log(`\n${C.TEAL}Here is the Working Agreement we arrived at:${C.RESET}\n`);
        console.log(`  Prime Directive: ${parsed.prime_directive}`);
        if (parsed.partnership)            console.log(`  Partnership: ${parsed.partnership}`);
        if (parsed.project_type)           console.log(`  Project type: ${parsed.project_type}`);
        if (parsed.deployment_target)      console.log(`  Deployment target: ${parsed.deployment_target}`);
        if (parsed.staging_path)           console.log(`  Staging path: ${parsed.staging_path}`);
        if (parsed.verification_commands)  console.log(`  Verification commands: ${parsed.verification_commands}`);
        if (parsed.danger_zones)           console.log(`  Danger zones: ${parsed.danger_zones}`);
        console.log('');

        const decision = await currentIO.ask('Accept, Edit, or Regenerate?', 'Accept',
          'Accept locks this in. Edit lets you rewrite the Prime Directive verbatim. Regenerate produces a new synthesis.');

        const d = decision.trim().toLowerCase();
        if (d === 'edit') {
          const edited = await currentIO.ask('Enter your Prime Directive verbatim:', parsed.prime_directive);
          parsed.prime_directive = edited;
        } else if (d === 'regenerate' || d === 'regen') {
          sessionTranscript += `\nUser: Regenerate the Working Agreement.\n`;
          continue;
        }
        // Accept or edited — build profile from sentinel fields
        profile = {
          primeDirective:        parsed.prime_directive,
          q3Raw:                 parsed.prime_directive,
          q4Raw:                 parsed.partnership || '',
          projectType:           parsed.project_type || (priorData && priorData.projectType) || '',
          users:                 parsed.users || (priorData && priorData.users) || '',
          deploymentTarget:      parsed.deployment_target || (priorData && priorData.deploymentTarget) || '',
          subjectRoot:           parsed.staging_path === 'internal' ? '' : (parsed.staging_path || (priorData && priorData.subjectRoot) || ''),
          verificationCommands:  parsed.verification_commands && parsed.verification_commands !== 'none'
                                   ? parsed.verification_commands.split(',').map(s => s.trim()).filter(Boolean)
                                   : (priorData && priorData.verificationCommands) || [],
          dangerZones:           parsed.danger_zones && parsed.danger_zones !== 'none'
                                   ? parsed.danger_zones.split(',').map(s => s.trim()).filter(Boolean)
                                   : (priorData && priorData.dangerZones) || [],
          realConstraints:       parsed.real_constraints && parsed.real_constraints !== 'none'
                                   ? parsed.real_constraints.split(',').map(s => s.trim()).filter(Boolean)
                                   : (priorData && priorData.realConstraints) || [],
          // Preserve fields from prior profile that sentinel doesn't cover
          ...(priorData ? {
            assumedConstraints:  priorData.assumedConstraints,
            canonicalConfigPath: priorData.canonicalConfigPath,
            onboardingVersion:   (priorData.onboardingVersion || 1) + 1,
          } : { onboardingVersion: 1 }),
          languages:    scan.languages,
          frameworks:   scan.frameworks,
          buildSystem:  scan.buildSystem,
          hasCI:        scan.hasCI,
          testCoverage: scan.testCoverage,
          projectNotes: { scanRoots: scan.scanRoots, scanSummary: { fileCount: scan.fileCount, tokenCountRaw: scan.tokenCountRaw } },
          onboardedAt:  Date.now(),
          binaryVersion: version,
          createdAt:    priorData ? (priorData.createdAt || new Date().toISOString()) : new Date().toISOString(),
          updatedAt:    new Date().toISOString(),
        };
        break;
      }

      // Sentinel absent — LLM asked a question. Display and get answer.
      // Strip any trailing sentinel fragment from the displayed text (defensive)
      const displayText = response.replace(/---WORKING AGREEMENT---[\s\S]*$/, '').trim();
      if (!displayText) continue;

      process.stdout.write(`\n${C.TEAL}${displayText}${C.RESET}\n`);

      // Handle staging directory opt-in gate (Section 36.5)
      if (/external staging|staging directory/i.test(displayText)) {
        const optIn = await currentIO.ask('Use an external staging directory? (default: no, uses .dev/worktree/)', 'N',
          'MBO uses a Mirror Box to safely stage changes. Default is internal .dev/worktree/.');
        const answer = optIn;
        sessionTranscript += `MBO: ${displayText}\nUser: ${answer}\n`;
        if (answer.toLowerCase() !== 'y') continue;
      }

      const answer = await currentIO.ask('', '', '');
      sessionTranscript += `MBO: ${displayText}\nUser: ${answer}\n`;

      // Handle staging auto-create inline (Section 36.5 / BUG-122)
      if (/staging|subject root|directory path/i.test(displayText) && answer) {
        const val = validateSubjectRoot(answer, projectRoot);
        if (!val.ok && val.reason === 'does_not_exist') {
          const confirm = await currentIO.ask(`The directory "${val.path}" doesn't exist yet. Create it now?`, 'Y');
          if (confirm.toLowerCase() === 'y') {
            try {
              fs.mkdirSync(val.path, { recursive: true });
              sessionTranscript += `System: Directory ${val.path} created.\n`;
            } catch (e) {
              console.log(`\n${C.GREY}Could not create directory: ${e.message}${C.RESET}\n`);
              sessionTranscript += `System: Failed to create ${val.path}: ${e.message}\n`;
            }
          }
        }
      }
    }

    if (!profile) {
      // Section 36.8: No stack trace. Plain-English error.
      throw new Error('interview completed without a Working Agreement — sentinel not received after maximum turns');
    }

    // Phase 5: Atomic Persistence
    profile.projectRoot = path.resolve(projectRoot); // BUG-086 fix round 2
    persistProfile(projectRoot, profile);
    ensureGovernanceDocs(projectRoot);
    updateSpecFromProfile(projectRoot, profile);
    console.log(`\n[Onboarding] Done. Working agreement locked in.`);
    return profile;

  } catch (err) {
    // Section 36.8: No raw stack trace in terminal output under any error condition.
    console.error(`\nSomething went wrong: ${err.message}.`);
    console.log(`Run 'mbo setup --verbose' for diagnostic output.\n`);
    throw err;
  } finally {
    if (currentIO.close) currentIO.close();
  }
}

async function checkOnboarding(projectRoot, options = {}) {
  const autoRun = options.autoRun !== false;
  const returnStatus = !!options.returnStatus;
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');

  let needsOnboarding = true;
  let reason = 'missing_profile';
  let profile = null;

  if (fs.existsSync(onboardingPath)) {
    try {
      profile = JSON.parse(fs.readFileSync(onboardingPath, 'utf8'));
      const canonicalCwd = fs.realpathSync(projectRoot);
      const canonicalStored = profile.projectRoot ? fs.realpathSync(profile.projectRoot) : null;

      if (canonicalCwd === canonicalStored) {
        needsOnboarding = false;
        reason = null;
      } else {
        reason = 'profile_drift';
        console.warn(`\n[SYSTEM] Project root mismatch detected (stored: ${profile.projectRoot || 'unknown — profile predates root-tracking'}). Triggering re-onboarding.`);
      }
    } catch (_e) {
      reason = 'profile_incomplete_or_stale';
    }
  }

  if (needsOnboarding && autoRun && isTTY()) {
    ensureGovernanceDocs(projectRoot);
    ensureSpecDoc(projectRoot);
    await runOnboarding(projectRoot, profile);
    needsOnboarding = false;
    reason = null;
  }

  if (returnStatus) {
    return { needsOnboarding, reason, profile };
  }
  return needsOnboarding;
}
module.exports = {
  checkOnboarding,
  runOnboarding,
  scanProject,
  buildScanBriefing,
  renderPlanAsText,
  validateVerificationCommands,
  validateDangerZones,
  validateSubjectRoot,
  ensureGovernanceDocs,
  ensureSpecDoc,
  updateSpecFromProfile,
};
