/**
 * src/cli/onboarding.js — MBO Project Onboarding
 * Implements onboarding/re-onboarding, profile validation, and file/DB parity.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { version } = require('../../package.json');
const { DBManager } = require('../state/db-manager');

const DEFAULT_SUBJECT_ROOT = path.join(os.homedir(), 'MBO_Alpha');
const MAX_FOLLOWUPS = 15;

const QUESTIONS = {
  projectType: {
    prompt: 'Is this a brand new project or an existing one?',
    help: 'Knowing if a project is "greenfield" helps me understand if I should be strictly preserving existing patterns or helping you establish new ones.',
    normalize: (v) => (String(v || '').toLowerCase().includes('new') ? 'greenfield' : 'existing'),
    validate: (v) => (v ? true : 'Please specify if this is a new or existing project.'),
  },
  users: {
    prompt: 'Who is this project for — who are the users?',
    help: 'This helps me prioritize different aspects of the codebase (e.g. accessibility for end-users, developer experience for libraries).',
    validate: (v) => (String(v || '').trim().length >= 2 ? true : 'Please provide a more descriptive answer for the project users.'),
  },
  q3Raw: {
    prompt: 'What is the single most important thing I should always keep in mind?',
    help: 'This is the core rule that governs all my actions. For example: "Performance is a feature" or "Security over speed".',
    validate: (v) => (String(v || '').trim().length >= 5 ? true : 'This is a critical signal. Please provide a more substantial answer.'),
  },
  q4Raw: {
    prompt: 'Is there anything else that will help us work together as partners?',
    help: 'Mention your communication style, preferred tools, or specific workflows you want me to follow.',
  },
  subjectRoot: {
    prompt: 'Provide the Subject-world root path for promotion/telemetry',
    help: 'This is the main directory where changes are applied and validated. It must be an absolute path to an existing directory. Root "/" is disallowed.',
    validate: (v) => {
      if (!v) return 'Subject root is required.';
      const expanded = v.replace(/^~/, os.homedir());
      const p = path.resolve(expanded);
      if (p === '/') return 'The root directory "/" is prohibited as a subject root for safety.';
      if (!path.isAbsolute(p)) return 'Path must be absolute.';
      if (!fs.existsSync(p)) return `Directory does not exist: ${p}`;
      if (!fs.statSync(p).isDirectory()) return 'Path is not a directory.';
      return true;
    },
    normalize: (v) => path.resolve(v.replace(/^~/, os.homedir())),
  },
  dangerZones: {
    prompt: 'Confirm or modify Danger Zones (high-risk files/dirs)',
    help: 'Danger zones trigger extra verification and higher-tier review. Avoid accidental edits to critical system or metadata folders.',
    normalize: (v) => normalizeList(v),
  },
  verificationCommands: {
    prompt: 'Confirm or modify Verification Commands (checks to run before shipping)',
    help: 'These commands are executed in the sandbox to verify behavioral correctness. Use "npm test", "npm run lint", etc.',
    validate: (v) => {
      const list = normalizeList(v);
      if (list.length === 0) return 'At least one verification command is required.';
      if (list.some(c => c === 'yes' || c === 'true')) return 'Invalid command detected ("yes"). Please provide real shell commands.';
      return true;
    },
    normalize: (v) => normalizeList(v),
  },
  realConstraints: {
    prompt: 'Confirm or modify Real Constraints (immutable project rules)',
    help: 'Inferred from your project files (e.g. node versions, deploy targets). These are hard rules MBO must not violate.',
    normalize: (v) => normalizeList(v),
  },
  assumedConstraints: {
    prompt: 'List any assumed constraints that still need verification',
    help: 'Assumptions are tracked in the ledger and verified over time. E.g. "Assuming memory budget < 512MB".',
    normalize: (v) => normalizeList(v),
  },
  ciIntent: {
    prompt: 'No CI detected. Should I treat this as intentional?',
    help: 'Continuous Integration (CI) ensures every change is tested automatically. If you plan to add it later, say so.',
  }
};

function isBroadRoot(p) {
  const home = os.homedir();
  const root = path.resolve(p);
  if (root === '/' || root === home || root === '/Users' || root === '/home') return true;
  // Also check if we are scanning a top-level dir like /Users/johnserious
  if (path.dirname(root) === '/Users' || path.dirname(root) === '/home') {
    // If it has a huge number of subdirs, it might be broad, but let's stick to these for now.
    return true;
  }
  return false;
}

function isQuestionNeeded(key, scan, prior, mode = 'update') {
  const core = ['projectType', 'users', 'q3Raw'];
  if (core.includes(key) && (!prior[key] || mode === 'redo')) return true;

  if (key === 'q4Raw' && mode === 'redo') return true;

  if (key === 'subjectRoot') {
    if (!prior.subjectRoot || mode === 'redo') return true;
    const valid = QUESTIONS.subjectRoot.validate(prior.subjectRoot);
    if (valid !== true) return true;
    return false;
  }

  if (key === 'ciIntent' && !scan.hasCI && !prior.ciIntent) return true;

  if (key === 'dangerZones') {
    if (mode === 'redo') return true;
    if (!prior.dangerZones || prior.dangerZones.length === 0) return true;
    // If we have a prior but it's very different from suggested, maybe ask? 
    // For now, trust the prior in update mode.
    return false;
  }

  if (key === 'verificationCommands') {
    if (mode === 'redo') return true;
    if (!prior.verificationCommands || prior.verificationCommands.length === 0) return true;
    if (scan.confidence.verificationCommands < 0.5) return true;
    return false;
  }

  if (key === 'realConstraints') {
    if (mode === 'redo') return true;
    if (!prior.realConstraints || prior.realConstraints.length === 0) {
       return scan.confidence.realConstraints < 0.8;
    }
    return false;
  }

  return false;
}

function isTTY() {
  return !!(process.stdin.isTTY && process.stdout.isTTY);
}

function createPromptIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (key, prompt, defaultValue = '', helpText = '') => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const fullPrompt = `${prompt}${suffix}\n> `;

    while (true) {
      const answer = await new Promise((resolve) => rl.question(fullPrompt, resolve));
      const trimmed = String(answer || '').trim();
      const input = trimmed || defaultValue || '';

      if (input.toLowerCase() === '?' || input.toLowerCase() === 'help') {
        console.log(`\n[Help] ${key}:`);
        console.log(helpText || 'No additional help available for this question.');
        console.log('');
        continue;
      }

      if (input.toLowerCase() === 'done') return 'done';

      const q = QUESTIONS[key];
      if (q && q.validate) {
        const valid = q.validate(input);
        if (valid !== true) {
          console.log(`[Validation Error] ${valid}`);
          continue;
        }
      }

      return q && q.normalize ? q.normalize(input) : input;
    }
  };
  return { ask, close: () => { rl.close(); process.stdin.resume(); } };
}

function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function getDb(projectRoot) {
  return new DBManager(path.join(projectRoot, '.mbo', 'mirrorbox.db'));
}

function readLatestDbProfile(projectRoot) {
  try {
    const db = getDb(projectRoot);
    const row = db.get('SELECT version, profile_data, created_at FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
    if (!row) return null;
    const parsed = JSON.parse(row.profile_data);
    return {
      version: row.version,
      createdAtMs: row.created_at || 0,
      profile: parsed,
    };
  } catch {
    return null;
  }
}

function readOnboardingFile(projectRoot) {
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  const data = readJSON(onboardingPath);
  return data || null;
}

function getScanRoots(projectRoot) {
  const cfgPath = path.join(projectRoot, '.mbo', 'config.json');
  const cfg = readJSON(cfgPath) || {};
  if (Array.isArray(cfg.scanRoots) && cfg.scanRoots.length > 0) {
    return cfg.scanRoots.map((r) => path.resolve(projectRoot, r));
  }

  // Layout-agnostic fallback detection.
  const candidates = ['src', 'lib', 'app', 'server', 'services'];
  const detected = candidates
    .map((d) => path.join(projectRoot, d))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());

  if (detected.length > 0) return detected;

  return [projectRoot];
}

function detectFrameworksAndBuild(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  const pyPath = path.join(projectRoot, 'pyproject.toml');
  const reqPath = path.join(projectRoot, 'requirements.txt');
  const cargoPath = path.join(projectRoot, 'Cargo.toml');
  const goPath = path.join(projectRoot, 'go.mod');

  const frameworks = new Set();
  let buildSystem = null;

  if (fs.existsSync(pkgPath)) {
    const pkg = readJSON(pkgPath) || {};
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    if (deps.react) frameworks.add('React');
    if (deps.next) frameworks.add('Next.js');
    if (deps.express) frameworks.add('Express');
    if (deps.vue) frameworks.add('Vue');
    if (deps.svelte) frameworks.add('Svelte');
    if (deps.koa) frameworks.add('Koa');
    buildSystem = 'npm';
  }

  if (fs.existsSync(pyPath) || fs.existsSync(reqPath)) {
    frameworks.add('Python');
    if (!buildSystem) buildSystem = fs.existsSync(pyPath) ? 'poetry/pip' : 'pip';
  }

  if (fs.existsSync(cargoPath)) {
    frameworks.add('Rust');
    if (!buildSystem) buildSystem = 'cargo';
  }

  if (fs.existsSync(goPath)) {
    frameworks.add('Go');
    if (!buildSystem) buildSystem = 'go';
  }

  return { frameworks: [...frameworks], buildSystem };
}

function detectCI(projectRoot) {
  const candidates = [
    path.join(projectRoot, '.github', 'workflows'),
    path.join(projectRoot, '.gitlab-ci.yml'),
    path.join(projectRoot, 'Jenkinsfile'),
    path.join(projectRoot, '.circleci', 'config.yml'),
  ];

  return candidates.some((p) => fs.existsSync(p));
}

function inferVerificationCommands(projectRoot, buildSystem) {
  const cmds = [];

  if (buildSystem === 'npm') {
    const pkg = readJSON(path.join(projectRoot, 'package.json')) || {};
    const scripts = pkg.scripts || {};
    if (scripts.test) cmds.push('npm test');
    if (scripts.lint) cmds.push('npm run lint');
    if (scripts.typecheck) cmds.push('npm run typecheck');
  }

  if (buildSystem === 'cargo') cmds.push('cargo test');
  if (buildSystem === 'go') cmds.push('go test ./...');
  if (buildSystem === 'poetry/pip' || buildSystem === 'pip') cmds.push('pytest');

  if (cmds.length === 0) cmds.push('manual verification required');
  return cmds;
}

function inferRealConstraints(projectRoot, scan) {
  const constraints = new Set();

  const pkg = readJSON(path.join(projectRoot, 'package.json')) || {};
  const engines = pkg.engines || {};
  if (engines.node) constraints.add(`node ${engines.node}`);
  if (engines.npm) constraints.add(`npm ${engines.npm}`);

  const vercelPath = path.join(projectRoot, 'vercel.json');
  const vercel = readJSON(vercelPath);
  if (vercel) {
    constraints.add('deploy target: vercel');
    if (typeof vercel.framework === 'string' && vercel.framework.trim()) {
      constraints.add(`vercel framework: ${vercel.framework.trim()}`);
    }
  }

  if (fs.existsSync(path.join(projectRoot, 'netlify.toml'))) {
    constraints.add('deploy target: netlify');
  }

  if (fs.existsSync(path.join(projectRoot, 'docker-compose.yml')) || fs.existsSync(path.join(projectRoot, 'Dockerfile'))) {
    constraints.add('containerized runtime (docker)');
  }

  const nextConfigCandidates = [
    path.join(projectRoot, 'next.config.js'),
    path.join(projectRoot, 'next.config.mjs'),
    path.join(projectRoot, 'next.config.cjs'),
  ];
  for (const cfgPath of nextConfigCandidates) {
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const text = fs.readFileSync(cfgPath, 'utf8');
      if (/output\s*:\s*['"]export['"]/.test(text)) constraints.add('Next.js static export mode');
      if (/output\s*:\s*['"]standalone['"]/.test(text)) constraints.add('Next.js standalone server mode');
      break;
    } catch (_) {}
  }

  const envExample = path.join(projectRoot, '.env.example');
  if (fs.existsSync(envExample)) {
    try {
      const lines = fs.readFileSync(envExample, 'utf8').split(/\r?\n/);
      const keys = lines
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
        .map((line) => line.split('=')[0]);
      if (keys.length > 0) {
        constraints.add(`required env vars: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', ...' : ''}`);
      }
    } catch (_) {}
  }

  if (scan && scan.buildSystem) constraints.add(`build system: ${scan.buildSystem}`);
  if (scan && Array.isArray(scan.frameworks) && scan.frameworks.length > 0) {
    constraints.add(`frameworks: ${scan.frameworks.join(', ')}`);
  }

  return [...constraints];
}

function synthesizePrimeDirective(context) {
  const q3 = String(context.q3Raw || '').trim();
  const q4 = String(context.q4Raw || '').trim();
  const users = String(context.users || '').trim();
  const realConstraints = normalizeList(context.realConstraints);
  const scan = context.scan || {};
  const followup = context.followup || {};

  const constraints = realConstraints.length > 0
    ? realConstraints
    : normalizeList(scan.realConstraintCandidates || []);

  const verification = normalizeList(followup.verificationCommands || scan.verificationCommands || []);

  let text = `MBO Mandate: ${q3 || 'Preserve project stability'}`;
  if (users) text += ` for ${users}`;
  text += '.';

  if (constraints.length > 0) {
    text += ` | Constraints: ${constraints.join('; ')}.`;
  }

  if (verification.length > 0) {
    text += ` | Verification: ${verification.join(', ')}.`;
  }

  if (q4) {
    text += ` | Partner Note: ${q4}.`;
  }

  return text;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildProfile({
  projectRoot,
  prior,
  answers,
  scan,
  followup,
  onboardingVersion,
}) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const realConstraints = normalizeList(followup.realConstraints || prior.realConstraints);
  const assumedConstraints = normalizeList(followup.assumedConstraints || prior.assumedConstraints);

  const primeDirective = synthesizePrimeDirective({
    q3Raw: answers.q3Raw || prior.q3Raw,
    q4Raw: answers.q4Raw || prior.q4Raw,
    users: answers.users || prior.users,
    realConstraints,
    scan,
    followup,
  });

  const subjectRootCandidate = String(followup.subjectRoot || prior.subjectRoot || DEFAULT_SUBJECT_ROOT).trim();
  const subjectRoot = subjectRootCandidate ? path.resolve(subjectRootCandidate.replace(/^~/, os.homedir())) : null;

  return {
    projectRoot: path.resolve(projectRoot),
    projectType: answers.projectType || prior.projectType,
    users: answers.users || prior.users,
    primeDirective,
    q3Raw: answers.q3Raw || prior.q3Raw,
    q4Raw: answers.q4Raw || prior.q4Raw,
    languages: scan.languages,
    frameworks: scan.frameworks,
    buildSystem: scan.buildSystem,
    testCoverage: scan.testCoverage,
    hasCI: scan.hasCI,
    verificationCommands: normalizeList(followup.verificationCommands || prior.verificationCommands || scan.verificationCommands),
    dangerZones: normalizeList(followup.dangerZones || prior.dangerZones),
    canonicalConfigPath: followup.canonicalConfigPath || prior.canonicalConfigPath || scan.canonicalConfigPath || null,
    onboardedAt: nowMs,
    onboardingVersion,
    binaryVersion: version,

    aestheticRules: followup.aestheticRules || prior.aestheticRules || null,
    firingOrder: followup.firingOrder || prior.firingOrder || null,
    subjectRoot,
    coordinateSystem: followup.coordinateSystem || prior.coordinateSystem || null,
    logFormat: followup.logFormat || prior.logFormat || null,
    failureProtocol: followup.failureProtocol || prior.failureProtocol || null,
    nextSessionTrigger: followup.nextSessionTrigger || prior.nextSessionTrigger || null,
    migrationPolicy: followup.migrationPolicy || prior.migrationPolicy || null,
    apiVersioningRules: followup.apiVersioningRules || prior.apiVersioningRules || null,
    deploymentTarget: followup.deploymentTarget || prior.deploymentTarget || null,
    infrastructureConstraints: normalizeList(followup.infrastructureConstraints || prior.infrastructureConstraints),
    realConstraints,
    assumedConstraints,

    projectNotes: {
      ...(prior.projectNotes || {}),
      scanRoots: scan.scanRoots,
      scanSummary: {
        fileCount: scan.fileCount,
        tokenCountRaw: scan.tokenCountRaw,
        skippedByIgnore: scan.skippedByIgnore,
      },
    },

    createdAt: prior.createdAt || nowIso,
    updatedAt: nowIso,
    baseline: prior.baseline || {
      tokenCountRaw: scan.tokenCountRaw,
      fileCount: scan.fileCount,
      timestamp: nowIso,
    },
  };
}

function profileTimestamp(profile, fallbackMs = 0) {
  const fromUpdatedAt = Date.parse(profile && profile.updatedAt ? profile.updatedAt : '');
  if (Number.isFinite(fromUpdatedAt) && fromUpdatedAt > 0) return fromUpdatedAt;
  const fromOnboardedAt = Number(profile && profile.onboardedAt);
  if (Number.isFinite(fromOnboardedAt) && fromOnboardedAt > 0) return fromOnboardedAt;
  return fallbackMs;
}

function canonicalizeForCompare(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const clone = JSON.parse(JSON.stringify(profile));
  delete clone.updatedAt;
  delete clone.createdAt;
  delete clone.onboardedAt;
  return clone;
}

function profilesDiffer(a, b) {
  return JSON.stringify(canonicalizeForCompare(a)) !== JSON.stringify(canonicalizeForCompare(b));
}

function validateProfile(profile) {
  const missing = [];

  const required = [
    'projectType', 'users', 'primeDirective', 'q3Raw', 'q4Raw', 'languages',
    'testCoverage', 'hasCI', 'verificationCommands', 'dangerZones', 'onboardingVersion', 'binaryVersion'
  ];

  for (const key of required) {
    const value = profile[key];
    const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) missing.push(key);
  }

  if (!profile.subjectRoot) {
    missing.push('subjectRoot');
  } else {
    const valid = QUESTIONS.subjectRoot.validate(profile.subjectRoot);
    if (valid !== true) missing.push(`subjectRoot(${valid})`);
  }

  return { complete: missing.length === 0, missing };
}

function scanProject(projectRoot) {
  const scanRoots = getScanRoots(projectRoot);
  const ignored = new Set(['.git', 'node_modules', '.mbo', 'data', 'audit', 'dist', 'build', '.next', '.cache']);
  const langMap = new Map([
    ['.js', 'JavaScript'],
    ['.cjs', 'JavaScript'],
    ['.mjs', 'JavaScript'],
    ['.ts', 'TypeScript'],
    ['.tsx', 'TypeScript'],
    ['.py', 'Python'],
    ['.go', 'Go'],
    ['.rs', 'Rust'],
    ['.java', 'Java'],
    ['.rb', 'Ruby'],
    ['.php', 'PHP'],
    ['.sh', 'Shell'],
  ]);

  let tokenCountRaw = 0;
  let fileCount = 0;
  let skippedByIgnore = 0;
  let testFiles = 0;
  const languages = new Set();

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignored.has(entry.name)) {
        skippedByIgnore += 1;
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.gz', '.db', '.sqlite', '.ico', '.woff', '.woff2'];
      if (binaryExts.includes(ext)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        tokenCountRaw += Math.ceil(content.length / 4);
        fileCount += 1;
      } catch {
        continue;
      }

      const lang = langMap.get(ext);
      if (lang) languages.add(lang);

      if (/test|spec/i.test(entry.name) || /[/\\](test|tests|__tests__)[/\\]/i.test(fullPath)) {
        testFiles += 1;
      }
    }
  }

  for (const root of scanRoots) {
    if (fs.existsSync(root)) walk(root);
  }

  const fw = detectFrameworksAndBuild(projectRoot);
  const hasCI = detectCI(projectRoot);
  const testCoverage = fileCount > 0 ? Math.min(1, testFiles / Math.max(1, fileCount)) : 0;

  let canonicalConfigPath = null;
  for (const p of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', '.mbo/config.json']) {
    const abs = path.join(projectRoot, p);
    if (fs.existsSync(abs)) {
      canonicalConfigPath = p;
      break;
    }
  }

  const suggestedDangerZones = [];
  for (const stateDir of ['.git', '.mbo', '.dev']) {
    if (fs.existsSync(path.join(projectRoot, stateDir))) suggestedDangerZones.push(`${stateDir}/`);
  }
  if (canonicalConfigPath) suggestedDangerZones.push(canonicalConfigPath);
  for (const lockFile of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock']) {
    if (fs.existsSync(path.join(projectRoot, lockFile))) { suggestedDangerZones.push(lockFile); break; }
  }

  return {
    tokenCountRaw,
    fileCount,
    skippedByIgnore,
    scanRoots: scanRoots.map((r) => path.relative(projectRoot, r) || '.'),
    languages: [...languages],
    frameworks: fw.frameworks,
    buildSystem: fw.buildSystem,
    testCoverage,
    hasCI,
    verificationCommands: inferVerificationCommands(projectRoot, fw.buildSystem),
    realConstraintCandidates: inferRealConstraints(projectRoot, {
      frameworks: fw.frameworks,
      buildSystem: fw.buildSystem,
      canonicalConfigPath,
    }),
    canonicalConfigPath,
    suggestedDangerZones,
    confidence: {
      buildSystem: !!fw.buildSystem,
      frameworks: fw.frameworks.length > 0,
      verificationCommands: fw.buildSystem ? 0.8 : 0.1,
      realConstraints: inferRealConstraints(projectRoot, {
        frameworks: fw.frameworks,
        buildSystem: fw.buildSystem,
        canonicalConfigPath,
      }).length > 0 ? 0.7 : 0.1,
    }
  };
}

function persistProfile(projectRoot, profile) {
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  writeJSON(onboardingPath, profile);

  const db = getDb(projectRoot);
  const latest = db.get('SELECT version, profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
  const latestProfile = latest ? JSON.parse(latest.profile_data) : null;

  if (latestProfile && !profilesDiffer(latestProfile, profile)) {
    return { wroteDb: false, wroteFile: true };
  }

  db.run('INSERT INTO onboarding_profiles (profile_data, created_at) VALUES (?, ?)', [
    JSON.stringify(profile),
    Date.now(),
  ]);

  return { wroteDb: true, wroteFile: true };
}

async function runOnboarding(projectRoot, priorData = null, options = {}) {
  const nonInteractive = !!options.nonInteractive;
  const prior = priorData || readOnboardingFile(projectRoot) || {};
  const io = nonInteractive ? { ask: async () => '', close: () => {} } : createPromptIO();

  try {
    console.log(`\n[Onboarding] Starting Adaptive Onboarding for: ${projectRoot}`);

    // Phase 0: Pre-Scan Guardrails
    const scanRoots = getScanRoots(projectRoot);
    const broadRoots = scanRoots.filter(r => isBroadRoot(r));
    if (broadRoots.length > 0 && !nonInteractive) {
      console.log(`\n[MBO] Warning: The following scan roots appear broad: ${broadRoots.map(r => path.relative(projectRoot, r)).join(', ') || '.'}`);
      console.log('Scanning these directories might take a long time or include unrelated files.');
      const confirm = await io.ask('confirmBroad', 'Do you want to continue?', 'Y', 'MBO detected that you are scanning a very large or root directory. If this is intentional, type Y. If you want to configure smaller scanRoots, edit .mbo/config.json.');
      if (String(confirm).toLowerCase() !== 'y') {
        console.log('[Onboarding] Aborted by user to configure scanRoots.');
        return null;
      }
    }

    console.log('[Onboarding] Phase 0: Running repository scan...');
    const scan = scanProject(projectRoot);

    // Phase 1: Briefing
    const confirmed = [
      `Files: ${scan.fileCount}`,
      `Languages: ${scan.languages.join(', ') || 'unknown'}`,
      `Build: ${scan.buildSystem || 'unknown'}`,
      scan.hasCI ? 'CI: Detected' : 'CI: Not detected',
    ];
    const inferred = [
      `Frameworks: ${scan.frameworks.join(', ') || 'none detected'}`,
      `Test Coverage: ${Math.round(scan.testCoverage * 100)}%`,
      `Config: ${scan.canonicalConfigPath || 'unknown'}`,
    ];
    const unknown = [];
    if (!scan.buildSystem) unknown.push('Build system (no lockfile or manifest detected)');
    if (scan.frameworks.length === 0) unknown.push('Application framework');
    if (!scan.hasCI) unknown.push('CI/CD pipeline');
    if (scan.testCoverage < 0.1) unknown.push('Test signal (low or missing test files)');

    console.log('\n[Onboarding] Phase 1: Scan Briefing');
    console.log('── Confirmed ──────────────────────────────────────');
    confirmed.forEach(c => console.log(`  • ${c}`));
    console.log('── Inferred ───────────────────────────────────────');
    inferred.forEach(i => console.log(`  • ${i}`));
    if (unknown.length > 0) {
      console.log('── Unknown/Low Confidence ─────────────────────────');
      unknown.forEach(u => console.log(`  • ${u}`));
    }
    console.log('───────────────────────────────────────────────────');

    // Phase 2: Mode Selection
    let mode = 'update';
    if (!nonInteractive && Object.keys(prior).length > 0) {
      console.log('\nAn existing onboarding profile was found.');
      const choice = await io.ask('', 'Update missing/changed fields (recommended) or Full redo?', 'Update');
      if (String(choice).toLowerCase().includes('redo')) mode = 'redo';
    }

    // Phase 3: Adaptive Interview
    console.log(`\n[Onboarding] Phase 3: ${mode === 'redo' ? 'Full Interview' : 'Adaptive Interview'}`);
    const answers = {};
    const followup = {};

    const allKeys = Object.keys(QUESTIONS);
    for (const key of allKeys) {
      const q = QUESTIONS[key];
      let defaultValue = prior[key] || '';
      if (Array.isArray(defaultValue)) defaultValue = defaultValue.join(', ');

      // Dynamic defaults from scan
      if (!defaultValue) {
        if (key === 'dangerZones') defaultValue = scan.suggestedDangerZones.join(', ');
        if (key === 'verificationCommands') defaultValue = scan.verificationCommands.join(', ');
        if (key === 'realConstraints') defaultValue = scan.realConstraintCandidates.join(', ');
        if (key === 'subjectRoot') defaultValue = DEFAULT_SUBJECT_ROOT;
      }

      let result;
      const providedAnswers = options.answers || {};
      const providedFollowup = options.followup || {};

      if (Object.prototype.hasOwnProperty.call(providedAnswers, key)) {
        result = providedAnswers[key];
      } else if (Object.prototype.hasOwnProperty.call(providedFollowup, key)) {
        result = providedFollowup[key];
      } else {
        if (!isQuestionNeeded(key, scan, prior, mode)) continue;
        if (nonInteractive) {
          result = defaultValue;
        } else {
          result = await io.ask(key, q.prompt, defaultValue, q.help);
        }
      }

      if (result === 'done') break;

      // Normalization and validation if provided via options
      if (q.validate && result) {
        const v = q.validate(result);
        if (v !== true) {
          if (nonInteractive) throw new Error(`Invalid value for ${key}: ${v}`);
          console.log(`[Validation Error] ${v}`);
          // If interactive, we should have already re-asked in io.ask. 
          // But if it came from options, we might need to handle it.
        }
      }
      const normalized = q.normalize && result ? q.normalize(result) : result;

      if (['projectType', 'users', 'q3Raw', 'q4Raw'].includes(key)) {
        answers[key] = normalized;
      } else {
        followup[key] = normalized;
      }
    }

    const versionNum = Number(prior.onboardingVersion);
    const onboardingVersion = Number.isFinite(versionNum) && versionNum > 0 ? versionNum + 1 : 1;

    // Phase 4: Synthesis + Confirmation
    const profile = buildProfile({
      projectRoot,
      prior,
      answers,
      scan,
      followup,
      onboardingVersion,
    });

    console.log('\n[Onboarding] Phase 4: Prime Directive Synthesis');
    console.log('───────────────────────────────────────────────────');
    console.log(profile.primeDirective);
    console.log('───────────────────────────────────────────────────');

    if (!nonInteractive) {
      while (true) {
        const action = await io.ask('', 'Accept, Edit, or Regenerate?', 'Accept');
        const choice = String(action).toLowerCase();
        if (choice === 'accept') break;
        if (choice === 'edit') {
          profile.primeDirective = await io.ask('primeDirective', 'Edit Prime Directive', profile.primeDirective);
          break;
        }
        if (choice === 'regenerate') {
          console.log('[Onboarding] Regenerating based on current context...');
          // In a real impl, this might tweak some weights or ask for more context.
          // For now, we just re-run the synthesis.
          profile.primeDirective = synthesizePrimeDirective({
            q3Raw: answers.q3Raw || prior.q3Raw,
            q4Raw: answers.q4Raw || prior.q4Raw,
            users: answers.users || prior.users,
            realConstraints: normalizeList(followup.realConstraints || prior.realConstraints),
            scan,
            followup,
          });
          console.log('\n' + profile.primeDirective);
          continue;
        }
      }
    }

    const validation = validateProfile(profile);
    if (!validation.complete) {
      throw new Error(`Onboarding profile incomplete: ${validation.missing.join(', ')}`);
    }

    persistProfile(projectRoot, profile);
    console.log('\n[Onboarding] Completed. Profile synced to onboarding.json and DB.');
    return profile;
  } finally {
    io.close();
  }
}


async function checkOnboarding(projectRoot) {
  const interactive = isTTY();
  const fileProfile = readOnboardingFile(projectRoot);
  const dbProfile = readLatestDbProfile(projectRoot);

  const conflict = resolveProfileConflict(fileProfile, dbProfile, interactive);

  if (conflict.needsPrompt && !interactive) {
    console.error('[WARN] onboarding profile drift detected and DB appears newer. Re-run in TTY to reconcile.');
    return true;
  }

  let activeProfile = conflict.profile;
  if (conflict.needsPrompt && conflict.reason === 'db_newer_conflict' && interactive) {
    activeProfile = await promptConflictResolution(conflict);
  }

  // BUG-086: Detect project root mismatch (e.g. profile copied from another project via cp -r).
  // If stored projectRoot doesn't match current cwd, treat as fresh install.
  // Also treat absent projectRoot (profile predates BUG-086 fix) as a mismatch.
  if (activeProfile) {
    const canonicalize = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
    const canonicalCwd = canonicalize(projectRoot);
    const canonicalStored = activeProfile.projectRoot ? canonicalize(activeProfile.projectRoot) : null;
    if (canonicalStored !== canonicalCwd) {
      const storedLabel = activeProfile.projectRoot || '(unknown — profile predates root-tracking)';
      console.log(`[SYSTEM] Onboarding profile belongs to a different project (${storedLabel}). Re-onboarding required.`);
      if (interactive) await runOnboarding(projectRoot);
      return true;
    }
  }

  if (!activeProfile) {
    if (interactive) await runOnboarding(projectRoot);
    return true;
  }

  // Backfill/migrate legacy profile shape.
  let needsReonboard = false;
  if (activeProfile.binaryVersion !== version) {
    console.log(`[SYSTEM] Onboarding binary mismatch (${activeProfile.binaryVersion || 'unknown'} vs ${version}). Re-onboard required.`);
    needsReonboard = true;
  }

  const validation = validateProfile(activeProfile);
  if (!validation.complete) {
    console.log(`[SYSTEM] Onboarding profile incomplete: ${validation.missing.join(', ')}`);
    needsReonboard = true;
  }

  if (needsReonboard) {
    if (interactive) {
      await runOnboarding(projectRoot, activeProfile);
    }
    return true;
  }

  // Keep file and DB synchronized even when complete.
  persistProfile(projectRoot, activeProfile);
  return false;
}

module.exports = {
  checkOnboarding,
  runOnboarding,
  validateProfile,
  scanProject,
  readLatestDbProfile,
  readOnboardingFile,
};
