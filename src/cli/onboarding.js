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

const DEFAULT_SUBJECT_ROOT = '/Users/johnserious/MBO_Alpha';
const MAX_FOLLOWUPS = 10;

const OPENING_QUESTIONS = [
  {
    key: 'projectType',
    prompt: 'Q1: Is this a brand new project or an existing one?',
    normalize: (value) => {
      const v = String(value || '').toLowerCase();
      if (v.includes('new') || v.includes('green')) return 'greenfield';
      return 'existing';
    },
  },
  {
    key: 'users',
    prompt: 'Q2: Who is this project for — who are the users?',
    normalize: (value) => String(value || '').trim(),
  },
  {
    key: 'q3Raw',
    prompt: 'Q3: What is the single most important thing I should always keep in mind when working on this project?',
    normalize: (value) => String(value || '').trim(),
  },
  {
    key: 'q4Raw',
    prompt: 'Q4: Is there anything else that will help us work together as partners on this project?',
    normalize: (value) => String(value || '').trim(),
  },
];

function isTTY() {
  return !!(process.stdin.isTTY && process.stdout.isTTY);
}

function createPromptIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt, defaultValue = '') => new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${prompt}${suffix}\n> `, (answer) => {
      const trimmed = String(answer || '').trim();
      resolve(trimmed || defaultValue || '');
    });
  });
  // BUG-092: After rl.close(), resume stdin so closing the readline interface
  // does not drain the event loop before the caller's promise chain completes.
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

  const userClause = users
    ? `for ${users}`
    : 'for the project stakeholders';

  const priority = q3
    ? q3.replace(/\s+/g, ' ').trim()
    : 'Preserve project stability and intent.';

  const constraints = realConstraints.length > 0
    ? realConstraints
    : normalizeList(scan.realConstraintCandidates || []);

  const constraintClause = constraints.length > 0
    ? `Respect these confirmed constraints: ${constraints.slice(0, 3).join('; ')}.`
    : `Respect the established project constraints, including ${scan.canonicalConfigPath || 'canonical config files'}.`;

  const verification = normalizeList(followup.verificationCommands || scan.verificationCommands || []);
  const verificationClause = verification.length > 0
    ? `Validate changes with: ${verification.slice(0, 2).join(' then ')}.`
    : 'Validate changes with the project test and lint workflow.';

  const collaborationClause = q4
    ? `Collaboration preference: ${q4.replace(/\s+/g, ' ').trim()}.`
    : '';

  return `Primary objective ${userClause}: ${priority}. ${constraintClause} ${verificationClause}${collaborationClause ? ` ${collaborationClause}` : ''}`;
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

  const realConstraints = normalizeList(followup.realConstraints);
  const assumedConstraints = normalizeList(followup.assumedConstraints);

  const primeDirective = synthesizePrimeDirective({
    q3Raw: answers.q3Raw,
    q4Raw: answers.q4Raw,
    users: answers.users,
    realConstraints,
    scan,
    followup,
  });

  const subjectRootCandidate = String(followup.subjectRoot || prior.subjectRoot || DEFAULT_SUBJECT_ROOT).trim();
  const subjectRoot = subjectRootCandidate ? path.resolve(subjectRootCandidate) : null;

  return {
    projectRoot: path.resolve(projectRoot),
    projectType: answers.projectType,
    users: answers.users,
    primeDirective,
    q3Raw: answers.q3Raw,
    q4Raw: answers.q4Raw,
    languages: scan.languages,
    frameworks: scan.frameworks,
    buildSystem: scan.buildSystem,
    testCoverage: scan.testCoverage,
    hasCI: scan.hasCI,
    verificationCommands: normalizeList(followup.verificationCommands || scan.verificationCommands),
    dangerZones: normalizeList(followup.dangerZones),
    canonicalConfigPath: followup.canonicalConfigPath || scan.canonicalConfigPath || null,
    onboardedAt: nowMs,
    onboardingVersion,
    binaryVersion: version,

    aestheticRules: followup.aestheticRules || null,
    firingOrder: followup.firingOrder || null,
    subjectRoot,
    coordinateSystem: followup.coordinateSystem || null,
    logFormat: followup.logFormat || null,
    failureProtocol: followup.failureProtocol || null,
    nextSessionTrigger: followup.nextSessionTrigger || null,
    migrationPolicy: followup.migrationPolicy || null,
    apiVersioningRules: followup.apiVersioningRules || null,
    deploymentTarget: followup.deploymentTarget || null,
    infrastructureConstraints: normalizeList(followup.infrastructureConstraints),
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
  } else if (!path.isAbsolute(profile.subjectRoot)) {
    missing.push('subjectRoot(abs_path_required)');
  } else if (!fs.existsSync(profile.subjectRoot)) {
    missing.push('subjectRoot(path_missing)');
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

  // BUG-088/089/090: Build suggested danger zones from detected state dirs, config path, and lock files.
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
  };
}

function deriveFollowupQuestions(scan, prior) {
  const questions = [];

  if (scan.testCoverage < 0.2) {
    questions.push({ key: 'testCoverageIntent', prompt: `I detected low test signal (${Math.round(scan.testCoverage * 100)}%). Is this intentional or a gap?` });
  }
  if (!scan.hasCI) {
    questions.push({
      key: 'ciIntent',
      prompt: `I did not detect CI (automated checks run on each commit/PR). Should I treat that as intentional?
Example: "Yes, intentional for now" or "No, add GitHub Actions soon."`
    });
  }
  if (!prior.subjectRoot) {
    questions.push({
      key: 'subjectRoot',
      prompt: `What project folder should I treat as your execution target root path?
This is the main directory where changes are applied and validated.
Example: /Users/johnserious/MBO_Alpha`
    });
  }
  if (!scan.canonicalConfigPath) {
    questions.push({
      key: 'canonicalConfigPath',
      prompt: `I could not infer the primary config file I should treat as authoritative.
Which file should be treated as the source of truth? Example: package.json`
    });
  }

  // BUG-088/089/090: Seed danger zones and verification commands from scan data.
  const dangerDefault = scan.suggestedDangerZones && scan.suggestedDangerZones.length > 0
    ? scan.suggestedDangerZones.join(', ') : '';
  const dangerPrompt = dangerDefault
    ? `I found likely danger zones (high-risk files/dirs to avoid accidental edits): ${dangerDefault}\nConfirm or modify (comma-separated).\nExample: .mbo/, .dev/, package-lock.json`
    : 'List high-risk files/dirs I should treat as danger zones (comma-separated).\nExample: .mbo/, .dev/, package-lock.json';
  questions.push({ key: 'dangerZones', prompt: dangerPrompt, defaultValue: dangerDefault });

  const verifDefault = scan.verificationCommands && scan.verificationCommands.length > 0
    ? scan.verificationCommands.join(', ') : '';
  const verifPrompt = verifDefault
    ? `I detected these verification commands (checks to run before shipping): ${verifDefault}\nConfirm or modify (comma-separated).\nExample: npm test, npm run lint`
    : 'List verification commands to run before shipping (comma-separated).\nExample: npm test, npm run lint';
  questions.push({ key: 'verificationCommands', prompt: verifPrompt, defaultValue: verifDefault });
  const realConstraintsDefault = Array.isArray(scan.realConstraintCandidates) && scan.realConstraintCandidates.length > 0
    ? scan.realConstraintCandidates.join(', ')
    : '';
  questions.push({
    key: 'realConstraints',
    prompt: realConstraintsDefault
      ? `I inferred these confirmed constraints from repo artifacts: ${realConstraintsDefault}\nConfirm or modify (comma-separated).`
      : 'List confirmed real constraints from this project (comma-separated).\nExample: deploy target: vercel, node >=20',
    defaultValue: realConstraintsDefault,
  });
  questions.push({
    key: 'assumedConstraints',
    prompt: 'List assumed constraints that still need verification (comma-separated).\nExample: memory budget < 512MB',
  });

  return questions.slice(0, MAX_FOLLOWUPS);
}

async function runFollowups(io, scan, prior, options = {}) {
  const answers = {};
  const nonInteractive = !!options.nonInteractive;
  const seeded = options.followup || {};
  const questions = deriveFollowupQuestions(scan, prior);

  for (const q of questions) {
    if (Object.prototype.hasOwnProperty.call(seeded, q.key)) {
      answers[q.key] = seeded[q.key];
      continue;
    }

    if (nonInteractive) continue;

    const value = await io.ask(`${q.prompt}\n(Type 'done' to stop follow-up questions, or '?' / 'help' for clarification)`, q.defaultValue || '');
    const normalizedValue = String(value).trim().toLowerCase();
    if (normalizedValue === '?' || normalizedValue === 'help') {
      console.log('[Onboarding] Clarification: answer in plain language. If unsure, keep the default and refine later.');
      const retry = await io.ask(`${q.prompt}\n(Type 'done' to stop follow-up questions)`, q.defaultValue || '');
      if (String(retry).trim().toLowerCase() === 'done') break;
      if (retry) answers[q.key] = retry;
      continue;
    }
    if (String(value).trim().toLowerCase() === 'done') break;
    if (value) answers[q.key] = value;
  }

  return { ...answers, ...seeded };
}

async function runPrimeDirectiveHandshake(io, profile, options = {}) {
  if (options.nonInteractive) return profile;

  console.log('\n[Onboarding] Proposed Prime Directive:');
  console.log(profile.primeDirective);

  let attempts = 0;
  while (attempts < 3) {
    attempts += 1;
    const paraphrase = await io.ask('Paraphrase this directive in your own words to confirm understanding');
    const pWords = new Set(String(paraphrase).toLowerCase().split(/\W+/).filter(Boolean));
    const dWords = new Set(String(profile.primeDirective).toLowerCase().split(/\W+/).filter(Boolean));
    let overlap = 0;
    for (const w of pWords) if (dWords.has(w)) overlap += 1;
    const ratio = dWords.size > 0 ? overlap / dWords.size : 0;

    if (ratio >= 0.15) {
      console.log('[Onboarding] Prime directive handshake confirmed.');
      return profile;
    }

    // BUG-091: Show overlap ratio and threshold so the user knows why they failed
    // and what a passing answer requires.
    const pct = Math.round(ratio * 100);
    console.log(`[Onboarding] Paraphrase diverged (overlap: ${pct}%, threshold: 15%). Tip: reuse key words from the directive text above. (Attempt ${attempts}/3)`);
  }

  throw new Error('Prime directive handshake failed after 3 attempts.');
}

function resolveProfileConflict(fileProfile, dbProfile, interactive) {
  if (!fileProfile && !dbProfile) return { profile: null, needsPrompt: false };
  if (fileProfile && !dbProfile) return { profile: fileProfile, needsPrompt: false };
  if (!fileProfile && dbProfile) return { profile: dbProfile.profile, needsPrompt: false };

  if (!profilesDiffer(fileProfile, dbProfile.profile)) {
    const fileTs = profileTimestamp(fileProfile, 0);
    const dbTs = profileTimestamp(dbProfile.profile, dbProfile.createdAtMs);
    return { profile: dbTs >= fileTs ? dbProfile.profile : fileProfile, needsPrompt: false };
  }

  const fileTs = profileTimestamp(fileProfile, 0);
  const dbTs = profileTimestamp(dbProfile.profile, dbProfile.createdAtMs);

  if (dbTs <= fileTs) {
    return { profile: fileProfile, needsPrompt: false };
  }

  if (!interactive) {
    return { profile: fileProfile, needsPrompt: true, reason: 'db_newer_conflict' };
  }

  return { profile: fileProfile, needsPrompt: true, reason: 'db_newer_conflict', dbCandidate: dbProfile.profile };
}

async function promptConflictResolution(conflict) {
  if (!isTTY()) return conflict.profile;

  const io = createPromptIO();
  try {
    console.log('[Onboarding] Detected onboarding profile drift: DB appears newer than onboarding.json.');
    const choice = await io.ask('Choose source of truth: type "spec" to keep onboarding.json/spec flow, or "db" to use DB profile', 'spec');
    const normalized = String(choice || '').trim().toLowerCase();
    if (normalized === 'db') return conflict.dbCandidate || conflict.profile;
    return conflict.profile;
  } finally {
    io.close();
  }
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
    console.log(`[Onboarding] Starting onboarding for: ${projectRoot}`);

    // Phase 1: fixed 4 questions.
    const answers = {};
    for (const q of OPENING_QUESTIONS) {
      const defaultValue = prior[q.key] || '';
      const raw = Object.prototype.hasOwnProperty.call(options.answers || {}, q.key)
        ? options.answers[q.key]
        : (nonInteractive ? defaultValue : await io.ask(q.prompt, defaultValue));
      answers[q.key] = q.normalize(raw);
    }

    // Phase 2: scan.
    console.log('[Onboarding] Running repository scan...');
    const scan = scanProject(projectRoot);
    const scanSummary = [
      `${scan.fileCount} files`,
      scan.languages.length > 0 ? scan.languages.join('/') : 'unknown language',
      scan.frameworks.length > 0 ? scan.frameworks.join(', ') : 'no framework detected',
      scan.buildSystem || 'unknown build system',
      scan.hasCI ? 'CI detected' : 'no CI detected',
    ].join(', ');
    console.log(`[Onboarding] Scan complete: ${scanSummary}.`);

    // Phase 3: targeted follow-up.
    const followup = await runFollowups(io, scan, prior, options);

    if (!followup.subjectRoot && prior.subjectRoot) {
      followup.subjectRoot = prior.subjectRoot;
    }
    if (!followup.subjectRoot && !nonInteractive) {
      followup.subjectRoot = await io.ask('Subject root path', DEFAULT_SUBJECT_ROOT);
    }

    const versionNum = Number(prior.onboardingVersion);
    const onboardingVersion = Number.isFinite(versionNum) && versionNum > 0 ? versionNum + 1 : 1;

    // Phase 4: synthesis + confirmation.
    const profile = buildProfile({
      projectRoot,
      prior,
      answers,
      scan,
      followup,
      onboardingVersion,
    });

    await runPrimeDirectiveHandshake(io, profile, options);

    const validation = validateProfile(profile);
    if (!validation.complete) {
      throw new Error(`Onboarding profile incomplete: ${validation.missing.join(', ')}`);
    }

    persistProfile(projectRoot, profile);
    console.log('[Onboarding] Completed. Profile synced to onboarding.json and onboarding_profiles.');
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
