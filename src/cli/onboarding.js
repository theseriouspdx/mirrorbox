/**
 * src/cli/onboarding.js — MBO Project Onboarding v2
 *
 * Adaptive Onboarding v2 Intelligence Layer (UX-022..UX-028):
 *   UX-022  Scan briefing: confirmed / inferred / unknown
 *   UX-023  Adaptive questioning: skip high-confidence fields, ask unknown/conflict
 *   UX-024  Re-onboarding mode: Update (default) vs Full redo
 *   UX-025  Contextual help: question-specific '?' handler
 *   UX-026  subjectRoot safety: expand ~, require absolute+existing, reject '/'
 *   UX-027  Prime directive v2: Accept / Edit / Regenerate controls
 *   UX-028  Semantic validation gate: reject nonsense values before persist
 *
 * Copy strings follow ux-copy-pack-v1.0.md / Section 36 rules:
 *   - No stage IDs in primary display
 *   - Every status line contains user-relevant state
 *   - Every error contains a recommended action
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { version } = require('../../package.json');
const { DBManager } = require('../state/db-manager');

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FOLLOWUPS = 10;

// Scan roots that, if detected as the fallback, warrant a confirmation prompt
// before walking (UX-028 guardrail: avoid accidental broad scans).
const EXPENSIVE_ROOTS_THRESHOLD_FILES = 2000;

// Semantic validation: values that look like answers but are not (UX-028).
const NONSENSE_COMMANDS = new Set([
  'yes', 'no', 'y', 'n', 'ok', 'sure', 'done', 'skip', 'none', 'na', 'n/a', '-',
]);

// Confidence thresholds for adaptive questioning (UX-023).
// Fields with confidence >= HIGH are skipped in Update mode.
const CONF = { HIGH: 0.8, MED: 0.5, LOW: 0 };

// ─── Opening questions (fixed 4, always asked on Full redo) ───────────────────

const OPENING_QUESTIONS = [
  {
    key: 'projectType',
    prompt: '1 of 4\n\nIs this a new project or an existing one?',
    helpText: [
      'Greenfield projects need different defaults than existing codebases —',
      'no legacy constraints to protect, no existing test suite to preserve.',
      'Either is fine; I just need to know which.',
    ].join('\n'),
    normalize: (value) => {
      const v = String(value || '').toLowerCase();
      if (v.includes('new') || v.includes('green')) return 'greenfield';
      return 'existing';
    },
    confidence: (prior) => (prior.projectType ? CONF.HIGH : CONF.LOW),
  },
  {
    key: 'users',
    prompt: '2 of 4\n\nWho is this project for — who are the users?',
    helpText: [
      '"Internal tool used by three engineers" and "public-facing app with paying',
      'customers" call for very different levels of caution on changes that touch',
      'the user experience.',
    ].join('\n'),
    normalize: (value) => String(value || '').trim(),
    confidence: (prior) => (prior.users ? CONF.HIGH : CONF.LOW),
  },
  {
    key: 'q3Raw',
    prompt: '3 of 4\n\nWhat is the single most important thing I should always keep\nin mind when working on this project?\n\nTake your time with this one. It shapes everything I do.',
    helpText: [
      'Think about what has broken before, what\'s fragile, what has cost you',
      'the most to fix. The answer doesn\'t have to be technical.',
      '',
      'Examples:',
      '  "It has to keep running on the legacy server — no new dependencies."',
      '  "Visual fidelity is everything — layout changes need careful review."',
      '  "It\'s for non-technical users — never increase UI complexity."',
    ].join('\n'),
    normalize: (value) => String(value || '').trim(),
    // Q3 is always asked — it's the prime directive seed
    confidence: (_prior) => CONF.LOW,
  },
  {
    key: 'q4Raw',
    prompt: '4 of 4\n\nIs there anything else that would help us work well together\non this project?',
    helpText: [
      'Open-ended on purpose. Previous failures, team context, things that aren\'t',
      'obvious from the code — or just "nothing else, let\'s go."',
    ].join('\n'),
    normalize: (value) => String(value || '').trim(),
    confidence: (prior) => (prior.q4Raw ? CONF.MED : CONF.LOW),
  },
];

// ─── Contextual help registry (UX-025) ───────────────────────────────────────

const FOLLOWUP_HELP = {
  testCoverageIntent: [
    'Test coverage is the fraction of your code exercised by tests.',
    'Low coverage means I have less automated evidence that my changes are safe.',
    'Intentionally low (e.g. scripts, prototypes) → I\'ll note it and move on.',
    'Gap you want addressed → I\'ll flag uncovered code during tasks.',
  ].join('\n'),

  ciIntent: [
    'CI (Continuous Integration) runs your tests automatically on every commit.',
    'Without it, test results depend on developers remembering to run them locally.',
    'If no CI is intentional (small team, manual process) → that\'s fine, I\'ll note it.',
    'If it\'s a gap → I\'ll flag test-breaking changes more prominently.',
  ].join('\n'),

  subjectRoot: [
    'The staging directory is where I apply and verify changes before they touch',
    'your main repository. Think of it as a sandbox copy of your project.',
    '',
    'Usually a neighboring directory with the same name + "_alpha" or "_staging".',
    'Example: if your project is at /Users/you/myapp, try /Users/you/myapp_staging',
    '',
    'The directory must already exist. MBO will not create it automatically.',
  ].join('\n'),

  canonicalConfigPath: [
    'The canonical config file is the one that "governs" the project —',
    'changing it tends to affect everything else.',
    'Examples: package.json, pyproject.toml, Cargo.toml, config/app.yml',
    'If there\'s no single canonical file, press Enter to skip.',
  ].join('\n'),

  dangerZones: [
    'Danger zones are files or directories I treat as high-risk.',
    'Any task touching them gets extra scrutiny and always requires your approval.',
    '',
    'Good candidates: auth code, database schemas, payment logic, critical configs.',
    'Format: comma-separated paths relative to project root.',
    'Example: src/auth,database/schema.sql,config/production.yml',
  ].join('\n'),

  verificationCommands: [
    'Verification commands are what "passing" looks like for your project.',
    'I run these after applying a change to confirm nothing broke.',
    '',
    'Examples: npm test, npm run lint, cargo test, pytest, go test ./...',
    'Format: comma-separated. Enter the commands you trust most.',
  ].join('\n'),

  realConstraints: [
    'Real constraints are limits that are genuinely load-bearing — things that',
    'cannot change regardless of what the code does.',
    '',
    'Examples:',
    '  "Must deploy to AWS Lambda" (from serverless.yml)',
    '  "Node 16 only — production environment is pinned"',
    '  "No new npm dependencies — security audit required"',
    '',
    'These go into the prime directive and affect every task I run.',
  ].join('\n'),

  assumedConstraints: [
    'Assumed constraints are things that seem like limits but haven\'t been verified.',
    'I\'ll track them separately and may ask clarifying questions when they\'re relevant.',
    '',
    'Example: "The legacy server can\'t upgrade" — is that definitely true,',
    'or is it an inherited assumption nobody has checked recently?',
  ].join('\n'),
};

// ─── TTY / IO ─────────────────────────────────────────────────────────────────

function isTTY() {
  return !!(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * createPromptIO — wraps readline with:
 *   - contextual '?' / 'help' handler (UX-025)
 *   - default value display
 *   - process.stdin.resume() on close to keep event loop alive
 */
function createPromptIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  /**
   * ask(prompt, defaultValue, helpText)
   * If user types '?' or 'help', print helpText and re-ask.
   * Returns the trimmed answer, or defaultValue if blank.
   */
  const ask = (prompt, defaultValue = '', helpText = '') => {
    return new Promise((resolve) => {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      const doAsk = () => {
        rl.question(`\n${prompt}${suffix}\n> `, (answer) => {
          const trimmed = String(answer || '').trim();
          if (trimmed === '?' || trimmed.toLowerCase() === 'help') {
            if (helpText) {
              console.log(`\n${helpText}\n`);
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
    // Keep stdin alive so the outer promise chain (persistInstallMetadata →
    // installMCPDaemon) can complete. Fixes BUG-092.
    if (process.stdin.resume) process.stdin.resume();
  };

  return { ask, close };
}

// ─── File / DB helpers ────────────────────────────────────────────────────────

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
    return { version: row.version, createdAtMs: row.created_at || 0, profile: parsed };
  } catch {
    return null;
  }
}

function readOnboardingFile(projectRoot) {
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  return readJSON(onboardingPath) || null;
}

// ─── Scan root detection ──────────────────────────────────────────────────────

function getScanRoots(projectRoot) {
  const cfgPath = path.join(projectRoot, '.mbo', 'config.json');
  const cfg = readJSON(cfgPath) || {};
  if (Array.isArray(cfg.scanRoots) && cfg.scanRoots.length > 0) {
    return cfg.scanRoots.map((r) => path.resolve(projectRoot, r));
  }

  const candidates = ['src', 'lib', 'app', 'server', 'services'];
  const detected = candidates
    .map((d) => path.join(projectRoot, d))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());

  if (detected.length > 0) return detected;
  return [projectRoot];
}

// ─── Framework / build / CI detection ────────────────────────────────────────

function detectFrameworksAndBuild(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  const frameworks = new Set();
  let buildSystem = null;

  if (fs.existsSync(pkgPath)) {
    const pkg = readJSON(pkgPath) || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.react) frameworks.add('React');
    if (deps.next) frameworks.add('Next.js');
    if (deps.express) frameworks.add('Express');
    if (deps.vue) frameworks.add('Vue');
    if (deps.svelte) frameworks.add('Svelte');
    if (deps.koa) frameworks.add('Koa');
    buildSystem = 'npm';
  }

  for (const [file, lang, bs] of [
    ['pyproject.toml', 'Python', 'poetry/pip'],
    ['requirements.txt', 'Python', 'pip'],
    ['Cargo.toml', 'Rust', 'cargo'],
    ['go.mod', 'Go', 'go'],
  ]) {
    if (fs.existsSync(path.join(projectRoot, file))) {
      frameworks.add(lang);
      if (!buildSystem) buildSystem = bs;
    }
  }

  return { frameworks: [...frameworks], buildSystem };
}

function detectCI(projectRoot) {
  return [
    path.join(projectRoot, '.github', 'workflows'),
    path.join(projectRoot, '.gitlab-ci.yml'),
    path.join(projectRoot, 'Jenkinsfile'),
    path.join(projectRoot, '.circleci', 'config.yml'),
  ].some((p) => fs.existsSync(p));
}

function inferVerificationCommands(projectRoot, buildSystem) {
  const cmds = [];
  if (buildSystem === 'npm') {
    const scripts = (readJSON(path.join(projectRoot, 'package.json')) || {}).scripts || {};
    if (scripts.test) cmds.push('npm test');
    if (scripts.lint) cmds.push('npm run lint');
    if (scripts.typecheck) cmds.push('npm run typecheck');
  }
  if (buildSystem === 'cargo') cmds.push('cargo test');
  if (buildSystem === 'go') cmds.push('go test ./...');
  if (buildSystem === 'poetry/pip' || buildSystem === 'pip') cmds.push('pytest');
  return cmds;
}

// ─── Constraint / deployment artifact inference (UX-023, BUG-097) ─────────────

/**
 * inferDeploymentTarget — reads common deployment config files.
 * Returns { target, source } or null.
 */
function inferDeploymentTarget(projectRoot) {
  if (fs.existsSync(path.join(projectRoot, 'vercel.json'))) return { target: 'Vercel', source: 'vercel.json' };
  if (fs.existsSync(path.join(projectRoot, 'netlify.toml'))) return { target: 'Netlify', source: 'netlify.toml' };
  if (fs.existsSync(path.join(projectRoot, 'fly.toml'))) return { target: 'Fly.io', source: 'fly.toml' };
  if (fs.existsSync(path.join(projectRoot, 'railway.toml'))) return { target: 'Railway', source: 'railway.toml' };
  if (fs.existsSync(path.join(projectRoot, 'Procfile'))) return { target: 'Heroku/Dokku', source: 'Procfile' };
  if (fs.existsSync(path.join(projectRoot, 'serverless.yml')) || fs.existsSync(path.join(projectRoot, 'serverless.yaml'))) {
    return { target: 'Serverless Framework (AWS Lambda)', source: 'serverless.yml' };
  }
  return null;
}

/**
 * inferRealConstraints — reads env and config artifacts to seed constraint list.
 * Returns array of plain-language constraint strings.
 */
function inferRealConstraints(projectRoot, scan) {
  const constraints = [];

  // .env.example → environment variable requirements
  const envExample = path.join(projectRoot, '.env.example');
  if (fs.existsSync(envExample)) {
    const lines = fs.readFileSync(envExample, 'utf8').split('\n')
      .filter((l) => l.trim() && !l.startsWith('#')).length;
    if (lines > 0) constraints.push(`${lines} environment variables required (from .env.example)`);
  }

  // Node version pinning
  const nvmrc = path.join(projectRoot, '.nvmrc');
  const nvmFile = path.join(projectRoot, '.node-version');
  if (fs.existsSync(nvmrc)) {
    const v = fs.readFileSync(nvmrc, 'utf8').trim();
    if (v) constraints.push(`Node.js version pinned to ${v} (.nvmrc)`);
  } else if (fs.existsSync(nvmFile)) {
    const v = fs.readFileSync(nvmFile, 'utf8').trim();
    if (v) constraints.push(`Node.js version pinned to ${v} (.node-version)`);
  }

  // Deployment target
  const deploy = inferDeploymentTarget(projectRoot);
  if (deploy) constraints.push(`Deployment target: ${deploy.target} (from ${deploy.source})`);

  return constraints;
}

// ─── UX-022: Scan briefing ────────────────────────────────────────────────────

/**
 * buildScanBriefing — classifies each scan finding into confirmed / inferred / unknown.
 * Returns a structured object used for display and adaptive questioning.
 */
function buildScanBriefing(projectRoot, scan, inferredConstraints) {
  const confirmed = [];
  const inferred = [];
  const unknown = [];

  // Languages / frameworks — confirmed from file existence
  if (scan.languages.length > 0) confirmed.push(`Language: ${scan.languages.join(', ')}`);
  else unknown.push('Language (no source files detected)');

  if (scan.frameworks.length > 0) confirmed.push(`Framework: ${scan.frameworks.join(', ')}`);
  else inferred.push('Framework: none detected');

  if (scan.buildSystem) confirmed.push(`Build system: ${scan.buildSystem}`);
  else unknown.push('Build system');

  // CI
  if (scan.hasCI) confirmed.push('CI: detected');
  else inferred.push('CI: not found — treating as intentional until confirmed');

  // Test coverage
  const covPct = Math.round(scan.testCoverage * 100);
  if (scan.testCoverage >= 0.2) confirmed.push(`Tests: ${covPct}% coverage signal`);
  else if (scan.fileCount > 0) inferred.push(`Tests: low signal (${covPct}%) — may be untested or using external runner`);
  else unknown.push('Tests');

  // Canonical config
  if (scan.canonicalConfigPath) confirmed.push(`Canonical config: ${scan.canonicalConfigPath}`);
  else unknown.push('Canonical config file');

  // Inferred constraints from artifacts
  for (const c of inferredConstraints) inferred.push(c);

  // Deployment target
  const deploy = inferDeploymentTarget(projectRoot);
  if (deploy) confirmed.push(`Deployment: ${deploy.target}`);
  else unknown.push('Deployment target');

  // File count
  confirmed.push(`Files scanned: ${scan.fileCount}`);

  return { confirmed, inferred, unknown };
}

function printScanBriefing(briefing) {
  console.log('\n[Scan] Done. Here\'s what I found:\n');

  if (briefing.confirmed.length > 0) {
    console.log('  Confirmed:');
    for (const item of briefing.confirmed) console.log(`    ✓  ${item}`);
  }

  if (briefing.inferred.length > 0) {
    console.log('\n  Inferred (I\'ll ask you to confirm):');
    for (const item of briefing.inferred) console.log(`    ~  ${item}`);
  }

  if (briefing.unknown.length > 0) {
    console.log('\n  Unknown (I\'ll ask):');
    for (const item of briefing.unknown) console.log(`    ?  ${item}`);
  }

  console.log('');
}

// ─── UX-026: subjectRoot safety ───────────────────────────────────────────────

/**
 * expandHome — replaces leading ~ with os.homedir().
 */
function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * validateSubjectRoot — returns { ok, reason } (UX-026).
 * Rules:
 *   - Must be absolute after expansion
 *   - Must not be '/' (filesystem root) unless explicitOverride
 *   - Must exist on disk
 *   - Must not equal projectRoot
 */
function validateSubjectRoot(raw, projectRoot, explicitOverride = false) {
  if (!raw || !String(raw).trim()) return { ok: false, reason: 'Path is empty.' };

  const expanded = expandHome(String(raw).trim());

  if (!path.isAbsolute(expanded)) {
    return { ok: false, reason: 'Path must be absolute (or start with ~).' };
  }

  const resolved = path.resolve(expanded);

  if (resolved === '/' && !explicitOverride) {
    return { ok: false, reason: 'Cannot use filesystem root "/" as staging directory. Be more specific.' };
  }

  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: `Directory does not exist: ${resolved}\nCreate it first, then re-run setup.` };
  }

  if (!fs.statSync(resolved).isDirectory()) {
    return { ok: false, reason: `${resolved} exists but is not a directory.` };
  }

  if (resolved === path.resolve(projectRoot)) {
    return { ok: false, reason: 'Staging directory cannot be the same as the project root.' };
  }

  return { ok: true, resolved };
}

/**
 * askSubjectRoot — interactive loop with safety checks (UX-026).
 */
async function askSubjectRoot(io, projectRoot, defaultValue) {
  const helpText = FOLLOWUP_HELP.subjectRoot;

  while (true) {
    const raw = await io.ask(
      'Where should I stage verified changes for you to test-drive\nbefore they go into your main repository?\n\n' +
      '  This is usually a copy of the project in a neighboring directory.\n' +
      '  The directory must already exist.',
      defaultValue,
      helpText,
    );

    // Explicit override for '/'
    const explicitOverride = String(raw).trim() === '/' && defaultValue === '/';
    const result = validateSubjectRoot(raw, projectRoot, explicitOverride);

    if (result.ok) return result.resolved;

    console.log(`\n  [✗] ${result.reason}`);
    console.log('  Try again, or type \'?\' for help.\n');
    // Loop continues
  }
}

// ─── UX-028: Semantic validation ──────────────────────────────────────────────

/**
 * validateVerificationCommands — rejects nonsense values.
 * Returns { ok, reason } or { ok: true }.
 */
function validateVerificationCommands(cmds) {
  if (!cmds || cmds.length === 0) return { ok: true }; // empty is allowed

  const nonsense = cmds.filter((c) => NONSENSE_COMMANDS.has(c.toLowerCase().trim()));
  if (nonsense.length > 0) {
    return {
      ok: false,
      reason: `These don't look like shell commands: ${nonsense.join(', ')}\n` +
        '  Expected: npm test, cargo test, pytest, etc.',
    };
  }

  // Each command must contain at least one space-separated word that's plausibly
  // a binary name (alphanumeric + common chars). Reject pure punctuation.
  const implausible = cmds.filter((c) => !/\w+/.test(c));
  if (implausible.length > 0) {
    return { ok: false, reason: `Implausible command(s): ${implausible.join(', ')}` };
  }

  return { ok: true };
}

/**
 * validateDangerZones — rejects clearly invalid paths.
 */
function validateDangerZones(zones) {
  if (!zones || zones.length === 0) return { ok: true };

  // Danger zones should be path-like, not sentences
  const suspicious = zones.filter((z) => z.includes(' ') && !z.includes('/') && !z.includes('\\'));
  if (suspicious.length > 0) {
    return {
      ok: false,
      reason: `These look like descriptions, not paths: ${suspicious.join(', ')}\n` +
        '  Expected: src/auth, config/production.yml, etc.',
    };
  }

  return { ok: true };
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

function scanProject(projectRoot, options = {}) {
  const scanRoots = getScanRoots(projectRoot);
  const ignored = new Set(['.git', 'node_modules', '.mbo', 'data', 'audit', 'dist', 'build', '.next', '.cache']);
  const langMap = new Map([
    ['.js', 'JavaScript'], ['.cjs', 'JavaScript'], ['.mjs', 'JavaScript'],
    ['.ts', 'TypeScript'], ['.tsx', 'TypeScript'],
    ['.py', 'Python'], ['.go', 'Go'], ['.rs', 'Rust'],
    ['.java', 'Java'], ['.rb', 'Ruby'], ['.php', 'PHP'], ['.sh', 'Shell'],
  ]);

  let tokenCountRaw = 0;
  let fileCount = 0;
  let skippedByIgnore = 0;
  let testFiles = 0;
  const languages = new Set();

  const onProgress = options.onProgress || null;

  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (ignored.has(entry.name)) { skippedByIgnore += 1; continue; }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(fullPath); continue; }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.gz', '.db', '.sqlite', '.ico', '.woff', '.woff2'];
      if (binaryExts.includes(ext)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        tokenCountRaw += Math.ceil(content.length / 4);
        fileCount += 1;
      } catch { continue; }

      const lang = langMap.get(ext);
      if (lang) languages.add(lang);

      if (/test|spec/i.test(entry.name) || /[/\\](test|tests|__tests__)[/\\]/i.test(fullPath)) {
        testFiles += 1;
      }
    }
  }

  for (const root of scanRoots) {
    if (onProgress) onProgress(path.relative(projectRoot, root) || '.');
    if (fs.existsSync(root)) walk(root);
  }

  const fw = detectFrameworksAndBuild(projectRoot);
  const hasCI = detectCI(projectRoot);
  const testCoverage = fileCount > 0 ? Math.min(1, testFiles / Math.max(1, fileCount)) : 0;

  let canonicalConfigPath = null;
  for (const p of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', '.mbo/config.json']) {
    if (fs.existsSync(path.join(projectRoot, p))) { canonicalConfigPath = p; break; }
  }

  return {
    tokenCountRaw, fileCount, skippedByIgnore,
    scanRoots: scanRoots.map((r) => path.relative(projectRoot, r) || '.'),
    languages: [...languages],
    frameworks: fw.frameworks,
    buildSystem: fw.buildSystem,
    testCoverage, hasCI,
    verificationCommands: inferVerificationCommands(projectRoot, fw.buildSystem),
    canonicalConfigPath,
  };
}

// ─── UX-023: Adaptive follow-up derivation ────────────────────────────────────

/**
 * fieldConfidence — returns how confident we are a field is already correct,
 * given the prior profile and scan data.
 * Used by adaptive questioning to skip high-confidence fields in Update mode.
 */
function fieldConfidence(key, prior, scan) {
  switch (key) {
    case 'dangerZones':
      // High confidence if prior has zones and scan didn't change file count dramatically
      return (Array.isArray(prior.dangerZones) && prior.dangerZones.length > 0) ? CONF.HIGH : CONF.LOW;

    case 'verificationCommands':
      // High confidence if prior matches what scan would infer
      if (!Array.isArray(prior.verificationCommands) || prior.verificationCommands.length === 0) return CONF.LOW;
      return CONF.HIGH;

    case 'realConstraints':
      return (Array.isArray(prior.realConstraints) && prior.realConstraints.length > 0) ? CONF.MED : CONF.LOW;

    case 'assumedConstraints':
      return CONF.MED; // always worth a quick revisit

    case 'canonicalConfigPath':
      if (scan.canonicalConfigPath) return CONF.HIGH; // detected automatically
      return prior.canonicalConfigPath ? CONF.MED : CONF.LOW;

    case 'subjectRoot':
      if (!prior.subjectRoot) return CONF.LOW;
      // Check the prior subjectRoot still exists
      try {
        if (fs.existsSync(prior.subjectRoot) && fs.statSync(prior.subjectRoot).isDirectory()) return CONF.HIGH;
      } catch { /* fall through */ }
      return CONF.LOW;

    case 'testCoverageIntent':
      return prior.testCoverageIntent ? CONF.HIGH : CONF.LOW;

    case 'ciIntent':
      return prior.ciIntent ? CONF.HIGH : CONF.LOW;

    default:
      return CONF.LOW;
  }
}

/**
 * deriveFollowupQuestions — generates follow-up questions adaptively.
 *
 * In Update mode (isFullRedo=false): skips fields with HIGH confidence.
 * In Full mode (isFullRedo=true): includes all questions.
 * Always includes subjectRoot if missing/invalid.
 */
function deriveFollowupQuestions(scan, prior, inferredConstraints, isFullRedo = false) {
  const questions = [];

  const shouldAsk = (key) => {
    if (isFullRedo) return true;
    const conf = fieldConfidence(key, prior, scan);
    return conf < CONF.HIGH;
  };

  // Low test coverage
  if (scan.testCoverage < 0.2 && shouldAsk('testCoverageIntent')) {
    questions.push({
      key: 'testCoverageIntent',
      prompt: `I detected low test signal (${Math.round(scan.testCoverage * 100)}%).\nIs this intentional or a gap you want addressed?`,
      helpText: FOLLOWUP_HELP.testCoverageIntent,
      default: prior.testCoverageIntent || '',
    });
  }

  // No CI
  if (!scan.hasCI && shouldAsk('ciIntent')) {
    questions.push({
      key: 'ciIntent',
      prompt: 'No CI configuration detected.\nShould I treat this as intentional? (yes / no / skip)',
      helpText: FOLLOWUP_HELP.ciIntent,
      default: prior.ciIntent || '',
    });
  }

  // Canonical config (if not auto-detected)
  if (!scan.canonicalConfigPath && shouldAsk('canonicalConfigPath')) {
    questions.push({
      key: 'canonicalConfigPath',
      prompt: 'I couldn\'t infer a canonical config file.\nWhich config file is authoritative for this project?',
      helpText: FOLLOWUP_HELP.canonicalConfigPath,
      default: prior.canonicalConfigPath || '',
    });
  }

  // Danger zones — always asked (high-visibility, user may want to add)
  if (shouldAsk('dangerZones')) {
    const scanSeeded = ['.mbo/', '.git/', 'package.json'].filter((z) =>
      fs.existsSync(path.join(prior._projectRoot || '', z.replace(/\/$/, '')))
    );
    const priorZones = Array.isArray(prior.dangerZones) ? prior.dangerZones : [];
    const combined = [...new Set([...scanSeeded, ...priorZones])].join(', ');
    questions.push({
      key: 'dangerZones',
      prompt: 'These are the files and directories I\'ll treat as high-risk:\n\n' +
        (combined ? `  Current: ${combined}` : '  None yet.') +
        '\n\nAdd, remove, or confirm? (comma-separated paths, or Enter to accept)',
      helpText: FOLLOWUP_HELP.dangerZones,
      default: combined,
    });
  }

  // Verification commands
  if (shouldAsk('verificationCommands')) {
    const scanCmds = scan.verificationCommands || [];
    const priorCmds = Array.isArray(prior.verificationCommands) ? prior.verificationCommands : [];
    const combined = [...new Set([...scanCmds, ...priorCmds])].join(', ');
    questions.push({
      key: 'verificationCommands',
      prompt: 'What does "this works" look like for your project?\n\n' +
        (combined ? `  Detected: ${combined}` : '  None detected — describe what to run.') +
        '\n\nConfirm or modify (comma-separated)',
      helpText: FOLLOWUP_HELP.verificationCommands,
      default: combined,
    });
  }

  // Real constraints — seeded with inferred artifacts (BUG-097)
  if (shouldAsk('realConstraints')) {
    const priorConstraints = Array.isArray(prior.realConstraints) ? prior.realConstraints : [];
    const seedText = inferredConstraints.length > 0
      ? '\n\n  Detected from project artifacts:\n' + inferredConstraints.map((c) => `    ~  ${c}`).join('\n')
      : '';
    questions.push({
      key: 'realConstraints',
      prompt: 'Are there hard constraints that cannot change regardless of what the code does?' +
        seedText +
        '\n\nAdd confirmed constraints (comma-separated, or Enter to accept detected ones)',
      helpText: FOLLOWUP_HELP.realConstraints,
      default: [...new Set([...inferredConstraints, ...priorConstraints])].join(', '),
    });
  }

  // Assumed constraints
  if (shouldAsk('assumedConstraints')) {
    questions.push({
      key: 'assumedConstraints',
      prompt: 'Are there constraints that seem real but haven\'t been verified?',
      helpText: FOLLOWUP_HELP.assumedConstraints,
      default: Array.isArray(prior.assumedConstraints) ? prior.assumedConstraints.join(', ') : '',
    });
  }

  return questions.slice(0, MAX_FOLLOWUPS);
}

// ─── Follow-up runner ─────────────────────────────────────────────────────────

async function runFollowups(io, scan, prior, inferredConstraints, options = {}) {
  const answers = {};
  const nonInteractive = !!options.nonInteractive;
  const seeded = options.followup || {};
  const isFullRedo = !!options.fullRedo;
  const questions = deriveFollowupQuestions(scan, prior, inferredConstraints, isFullRedo);

  for (const q of questions) {
    if (Object.prototype.hasOwnProperty.call(seeded, q.key)) {
      answers[q.key] = seeded[q.key];
      continue;
    }

    if (nonInteractive) {
      if (q.default) answers[q.key] = q.default;
      continue;
    }

    const value = await io.ask(q.prompt, q.default || '', q.helpText || '');
    if (String(value).trim().toLowerCase() === 'done') break;
    if (value !== undefined && value !== '') answers[q.key] = value;
  }

  return { ...answers, ...seeded };
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

// ─── UX-027: Prime directive v2 synthesis ─────────────────────────────────────

/**
 * synthesizePrimeDirective — synthesizes from full context, not just q3.
 *
 * v2 improvements over v1:
 *   - Incorporates real constraints (not just first element)
 *   - References deployment target if detected
 *   - Uses q4 partnership signal
 *   - Formats as a coherent sentence, not a template string
 */
function synthesizePrimeDirective(q3Raw, q4Raw, realConstraints, deploymentTarget, canonicalConfigPath) {
  const priority = String(q3Raw || '').trim() || 'Preserve project stability and intent';

  const constraintParts = [];
  if (Array.isArray(realConstraints) && realConstraints.length > 0) {
    constraintParts.push(...realConstraints.slice(0, 3));
  }
  if (deploymentTarget) {
    const already = constraintParts.some((c) => c.toLowerCase().includes(deploymentTarget.toLowerCase()));
    if (!already) constraintParts.push(`Deployment target: ${deploymentTarget}`);
  }
  if (canonicalConfigPath && !constraintParts.some((c) => c.includes(canonicalConfigPath))) {
    constraintParts.push(`${canonicalConfigPath} is the canonical config — changes to it cascade broadly`);
  }

  const partnershipNote = String(q4Raw || '').trim();

  let directive = priority;
  if (constraintParts.length > 0) {
    directive += `. Load-bearing constraints: ${constraintParts.join('; ')}.`;
  }
  if (partnershipNote && partnershipNote.length > 3) {
    // Trim to avoid echoing a very long q4 verbatim
    const note = partnershipNote.length > 80 ? partnershipNote.slice(0, 77) + '…' : partnershipNote;
    directive += ` Partnership note: ${note}`;
  }

  return directive;
}

/**
 * runPrimeDirectiveHandshake — v2 with Accept / Edit / Regenerate controls (UX-027).
 *
 * In v1: bare paraphrase quiz.
 * In v2:
 *   - Shows synthesis with sourcing (why this directive)
 *   - Accept: skip paraphrase (user trusts the synthesis)
 *   - Edit:   user types corrected directive directly
 *   - Regenerate: re-synthesize after user provides correction hint
 *   - Default path: paraphrase confirmation with contrast feedback on mismatch
 */
async function runPrimeDirectiveHandshake(io, profile, q4Raw, options = {}) {
  if (options.nonInteractive) return profile;

  const directive = profile.primeDirective;

  console.log('\n[Onboarding] Here\'s what I\'ve synthesized as the load-bearing constraint:\n');
  console.log(`  ┌${'─'.repeat(68)}┐`);
  const words = directive.match(/.{1,66}/g) || [directive];
  for (const line of words) console.log(`  │ ${line.padEnd(66)} │`);
  console.log(`  └${'─'.repeat(68)}┘`);
  console.log('');
  console.log('  Options:');
  console.log('    accept      Lock this in as-is');
  console.log('    edit        Type a corrected directive');
  console.log('    paraphrase  Confirm by restating in your own words (default)');
  console.log('');

  const choice = await io.ask('accept / edit / paraphrase', 'paraphrase',
    'accept = trust the synthesis\nedit = type your own directive\nparaphrase = confirm by restating'
  );
  const c = String(choice).trim().toLowerCase();

  if (c === 'accept') {
    console.log('\n[Onboarding] Directive accepted.');
    return profile;
  }

  if (c === 'edit') {
    const edited = await io.ask('Type your directive', directive, FOLLOWUP_HELP.realConstraints);
    const trimmed = String(edited).trim();
    if (trimmed) {
      profile.primeDirective = trimmed;
      console.log('\n[Onboarding] Directive updated.');
    }
    return profile;
  }

  // Default: paraphrase path (with contrast feedback on mismatch)
  let attempts = 0;
  while (attempts < 3) {
    attempts += 1;
    const paraphrase = await io.ask(
      `Before I lock this in: put it in your own words. (attempt ${attempts}/3)\nI want to make sure I understood you correctly.`,
      '',
      'Reuse key words from the directive. You don\'t need to quote it exactly.',
    );

    const pWords = new Set(String(paraphrase).toLowerCase().split(/\W+/).filter(Boolean));
    const dWords = new Set(directive.toLowerCase().split(/\W+/).filter(Boolean));
    let overlap = 0;
    for (const w of pWords) if (dWords.has(w)) overlap += 1;
    const ratio = dWords.size > 0 ? overlap / dWords.size : 0;

    if (ratio >= 0.15) {
      console.log(`\n[Onboarding] Got it — we're aligned. (${Math.round(ratio * 100)}% conceptual overlap)`);
      return profile;
    }

    if (attempts < 3) {
      console.log('\n[Onboarding] Still diverging — let me highlight the contrast:');
      console.log(`  What you said: "${paraphrase}"`);
      console.log(`  What I have:   "${directive.slice(0, 120)}${directive.length > 120 ? '…' : ''}"`);
      console.log('\n  Which is correct — or is the truth somewhere in between?');
      console.log('  Type \'edit\' to correct the directive, or try the paraphrase again.');

      const retry = await io.ask('edit / try again', 'try again', '');
      if (String(retry).trim().toLowerCase() === 'edit') {
        const edited = await io.ask('Type the corrected directive', directive, '');
        if (String(edited).trim()) profile.primeDirective = String(edited).trim();
        console.log('\n[Onboarding] Directive updated.');
        return profile;
      }
    }
  }

  // After 3 failed paraphrases: rebuild from scratch
  console.log('\n[Onboarding] We\'re not converging. Let\'s build this from scratch.');
  const fresh = await io.ask(
    'In one sentence: what should never be compromised when you work here?',
    '',
    'This becomes the prime directive. Be specific.',
  );
  if (String(fresh).trim()) profile.primeDirective = String(fresh).trim();
  console.log('\n[Onboarding] Directive set.');
  return profile;
}

// ─── Profile construction ─────────────────────────────────────────────────────

function buildProfile({ projectRoot, prior, answers, scan, followup, onboardingVersion, inferredConstraints }) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const realConstraints = normalizeList(followup.realConstraints);
  const assumedConstraints = normalizeList(followup.assumedConstraints);
  const deploy = inferDeploymentTarget(projectRoot);

  const primeDirective = synthesizePrimeDirective(
    answers.q3Raw,
    answers.q4Raw,
    realConstraints.length > 0 ? realConstraints : (inferredConstraints || []),
    deploy ? deploy.target : null,
    followup.canonicalConfigPath || scan.canonicalConfigPath || null,
  );

  // subjectRoot — already validated before buildProfile is called
  const subjectRoot = followup.subjectRoot
    ? path.resolve(expandHome(String(followup.subjectRoot).trim()))
    : (prior.subjectRoot || null);

  return {
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
    verificationCommands: normalizeList(followup.verificationCommands || scan.verificationCommands.join(',')),
    dangerZones: normalizeList(followup.dangerZones),
    canonicalConfigPath: followup.canonicalConfigPath || scan.canonicalConfigPath || null,
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
    deploymentTarget: deploy ? deploy.target : (prior.deploymentTarget || null),
    infrastructureConstraints: normalizeList(followup.infrastructureConstraints),
    realConstraints,
    assumedConstraints,
    testCoverageIntent: followup.testCoverageIntent || prior.testCoverageIntent || null,
    ciIntent: followup.ciIntent || prior.ciIntent || null,

    projectNotes: {
      ...(prior.projectNotes || {}),
      scanRoots: scan.scanRoots,
      scanSummary: { fileCount: scan.fileCount, tokenCountRaw: scan.tokenCountRaw, skippedByIgnore: scan.skippedByIgnore },
    },

    createdAt: prior.createdAt || nowIso,
    updatedAt: nowIso,
    baseline: prior.baseline || { tokenCountRaw: scan.tokenCountRaw, fileCount: scan.fileCount, timestamp: nowIso },
  };
}

// ─── Profile validation ───────────────────────────────────────────────────────

function validateProfile(profile) {
  const missing = [];
  const required = [
    'projectType', 'users', 'primeDirective', 'q3Raw', 'q4Raw', 'languages',
    'testCoverage', 'hasCI', 'verificationCommands', 'dangerZones', 'onboardingVersion', 'binaryVersion',
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

  // UX-028: semantic validation on lists
  const verifResult = validateVerificationCommands(profile.verificationCommands);
  if (!verifResult.ok) missing.push(`verificationCommands(${verifResult.reason})`);

  const dangerResult = validateDangerZones(profile.dangerZones);
  if (!dangerResult.ok) missing.push(`dangerZones(${dangerResult.reason})`);

  return { complete: missing.length === 0, missing };
}

// ─── Profile persistence ──────────────────────────────────────────────────────

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
  delete clone.updatedAt; delete clone.createdAt; delete clone.onboardedAt;
  return clone;
}

function profilesDiffer(a, b) {
  return JSON.stringify(canonicalizeForCompare(a)) !== JSON.stringify(canonicalizeForCompare(b));
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

// ─── Conflict resolution ──────────────────────────────────────────────────────

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
  if (dbTs <= fileTs) return { profile: fileProfile, needsPrompt: false };
  if (!interactive) return { profile: fileProfile, needsPrompt: true, reason: 'db_newer_conflict' };
  return { profile: fileProfile, needsPrompt: true, reason: 'db_newer_conflict', dbCandidate: dbProfile.profile };
}

async function promptConflictResolution(conflict) {
  if (!isTTY()) return conflict.profile;
  const io = createPromptIO();
  try {
    console.log('[Onboarding] Profile drift detected: the database has a newer version than onboarding.json.');
    const choice = await io.ask(
      'Which should I use?\n  spec = keep onboarding.json\n  db   = use database version',
      'spec',
      'Choosing "db" will use the more recent database profile, discarding any manual edits to onboarding.json.',
    );
    if (String(choice || '').trim().toLowerCase() === 'db') return conflict.dbCandidate || conflict.profile;
    return conflict.profile;
  } finally {
    io.close();
  }
}

// ─── UX-024: Mode selection (Update vs Full redo) ─────────────────────────────

/**
 * askOnboardingMode — prompts user to choose Update or Full redo.
 * Returns true if Full redo, false for Update.
 */
async function askOnboardingMode(io, prior) {
  const lastDate = prior.updatedAt
    ? new Date(prior.updatedAt).toLocaleDateString()
    : 'unknown date';

  console.log(`\n[Onboarding] An existing profile was found (last updated: ${lastDate}).\n`);
  console.log('  update   Update answers that have changed or are uncertain (faster)');
  console.log('  redo     Answer everything from scratch (full re-onboarding)\n');

  const choice = await io.ask('update / redo', 'update',
    '"update" skips questions where I\'m already confident.\n"redo" asks every question again from the beginning.'
  );
  return String(choice).trim().toLowerCase() === 'redo';
}

// ─── Main onboarding flow ─────────────────────────────────────────────────────

/**
 * runOnboarding — Adaptive Onboarding v2 entry point.
 *
 * options:
 *   nonInteractive  boolean     — skip all prompts, use defaults / seeded values
 *   fullRedo        boolean     — force full re-onboarding (skip adaptive mode selection)
 *   answers         object      — seed opening question answers (for tests)
 *   followup        object      — seed follow-up answers (for tests)
 */
async function runOnboarding(projectRoot, priorData = null, options = {}) {
  const nonInteractive = !!options.nonInteractive;
  const prior = { ...(priorData || readOnboardingFile(projectRoot) || {}), _projectRoot: projectRoot };

  const io = nonInteractive ? { ask: async (_, def) => def || '', close: () => {} } : createPromptIO();

  try {
    const hasPrior = !!(prior.q3Raw || prior.primeDirective);

    // ── Mode selection (UX-024) ──────────────────────────────────────────────
    let isFullRedo = !!options.fullRedo;
    if (!nonInteractive && hasPrior && !isFullRedo) {
      isFullRedo = await askOnboardingMode(io, prior);
    } else if (!hasPrior) {
      // Fresh install — always full
      isFullRedo = true;
      console.log('\nMirror Box Orchestrator\n───────────────────────');
      console.log('Before I look at any code, I want to understand what we\'re working on together.');
      console.log('\nThis takes about five minutes:');
      console.log('  1. A few questions about your project');
      console.log('  2. A scan of your codebase');
      console.log('  3. A few follow-up questions based on what I find');
      console.log('  4. Agreeing on the rules I\'ll follow when I work here\n');
    }

    // ── Phase 1: Opening questions ───────────────────────────────────────────
    const answers = {};
    for (const q of OPENING_QUESTIONS) {
      const defaultValue = prior[q.key] || '';

      // In Update mode: skip high-confidence opening questions
      if (!isFullRedo && q.confidence(prior) >= CONF.HIGH && !options.answers) {
        answers[q.key] = q.normalize(defaultValue);
        continue;
      }

      const raw = Object.prototype.hasOwnProperty.call(options.answers || {}, q.key)
        ? options.answers[q.key]
        : (nonInteractive ? defaultValue : await io.ask(q.prompt, defaultValue, q.helpText));
      answers[q.key] = q.normalize(raw);
    }

    // ── Phase 2: Scan with live narration ────────────────────────────────────
    if (!nonInteractive) process.stdout.write('\n[Scan] Scanning your codebase...');

    const scan = scanProject(projectRoot, {
      onProgress: nonInteractive ? null : (root) => {
        process.stdout.write(`\r[Scan] Scanning ${root}...`);
      },
    });

    if (!nonInteractive) process.stdout.write('\r');

    // ── UX-022: Scan briefing ────────────────────────────────────────────────
    const inferredConstraints = inferRealConstraints(projectRoot, scan);
    const briefing = buildScanBriefing(projectRoot, scan, inferredConstraints);
    if (!nonInteractive) printScanBriefing(briefing);

    if (!nonInteractive && (briefing.inferred.length > 0 || briefing.unknown.length > 0)) {
      console.log('Now I have a few follow-up questions based on what I found.\n');
    }

    // ── Phase 3: Adaptive follow-ups ─────────────────────────────────────────
    const followup = await runFollowups(io, scan, prior, inferredConstraints, {
      ...options,
      isFullRedo,
    });

    // subjectRoot — interactive safety loop (UX-026)
    if (!nonInteractive && !followup.subjectRoot) {
      const defaultSR = prior.subjectRoot || path.join(path.dirname(projectRoot), path.basename(projectRoot) + '_staging');
      followup.subjectRoot = await askSubjectRoot(io, projectRoot, defaultSR);
    } else if (followup.subjectRoot) {
      // Validate seeded subjectRoot (UX-026, for non-interactive / test paths)
      const result = validateSubjectRoot(followup.subjectRoot, projectRoot);
      if (!result.ok) {
        // In non-interactive mode, keep the path but it will fail validateProfile
        // so the caller gets a clear error. Don't silently discard.
      } else {
        followup.subjectRoot = result.resolved;
      }
    }

    // ── UX-028: Semantic validation of follow-up values ──────────────────────
    const verifCmds = normalizeList(followup.verificationCommands || scan.verificationCommands.join(','));
    const verifCheck = validateVerificationCommands(verifCmds);
    if (!verifCheck.ok && !nonInteractive) {
      console.log(`\n[✗] ${verifCheck.reason}`);
      const corrected = await io.ask('Enter valid verification commands (comma-separated)', '', FOLLOWUP_HELP.verificationCommands);
      followup.verificationCommands = corrected;
    }

    const dangerZones = normalizeList(followup.dangerZones);
    const dangerCheck = validateDangerZones(dangerZones);
    if (!dangerCheck.ok && !nonInteractive) {
      console.log(`\n[✗] ${dangerCheck.reason}`);
      const corrected = await io.ask('Enter danger zone paths (comma-separated)', '', FOLLOWUP_HELP.dangerZones);
      followup.dangerZones = corrected;
    }

    // ── Phase 4: Build profile ────────────────────────────────────────────────
    const versionNum = Number(prior.onboardingVersion);
    const onboardingVersion = Number.isFinite(versionNum) && versionNum > 0 ? versionNum + 1 : 1;

    const profile = buildProfile({
      projectRoot,
      prior,
      answers,
      scan,
      followup,
      onboardingVersion,
      inferredConstraints,
    });

    // ── UX-027: Prime directive handshake v2 ─────────────────────────────────
    await runPrimeDirectiveHandshake(io, profile, answers.q4Raw, options);

    // ── Validation gate ───────────────────────────────────────────────────────
    const validation = validateProfile(profile);
    if (!validation.complete) {
      throw new Error(`Onboarding profile incomplete: ${validation.missing.join(', ')}`);
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    persistProfile(projectRoot, profile);

    if (!nonInteractive) {
      console.log('\n[Onboarding] Done. Your project profile is saved.\n');
      console.log(`  Prime directive:   locked ✓`);
      console.log(`  Danger zones:      ${profile.dangerZones.length} defined ✓`);
      console.log(`  Verification:      ${profile.verificationCommands.length} command(s) ✓`);
      if (profile.subjectRoot) console.log(`  Staging path:      ${profile.subjectRoot} ✓`);
    }

    return profile;
  } finally {
    io.close();
  }
}

// ─── checkOnboarding (gate for session start) ─────────────────────────────────

async function checkOnboarding(projectRoot, options = {}) {
  const autoRun = options.autoRun !== false;
  const returnStatus = !!options.returnStatus;
  const interactive = isTTY();
  const fileProfile = readOnboardingFile(projectRoot);
  const dbProfile = readLatestDbProfile(projectRoot);

  const conflict = resolveProfileConflict(fileProfile, dbProfile, interactive);

  if (conflict.needsPrompt && !interactive) {
    console.error('[Onboarding] Profile drift detected and DB appears newer. Re-run in TTY to reconcile.');
    if (returnStatus) return { needsOnboarding: true, reason: 'profile_drift', profile: null };
    return true;
  }

  let activeProfile = conflict.profile;
  if (conflict.needsPrompt && conflict.reason === 'db_newer_conflict' && interactive) {
    activeProfile = await promptConflictResolution(conflict);
  }

  if (!activeProfile) {
    if (interactive && autoRun) await runOnboarding(projectRoot);
    if (returnStatus) return { needsOnboarding: true, reason: 'missing_profile', profile: null };
    return true;
  }

  let needsReonboard = false;
  if (activeProfile.binaryVersion !== version) {
    console.log(`[Onboarding] Binary version changed (${activeProfile.binaryVersion || 'unknown'} → ${version}). Re-onboarding required.`);
    needsReonboard = true;
  }

  const validation = validateProfile(activeProfile);
  if (!validation.complete) {
    console.log(`[Onboarding] Profile incomplete: ${validation.missing.join(', ')}`);
    needsReonboard = true;
  }

  if (needsReonboard) {
    if (interactive && autoRun) await runOnboarding(projectRoot, activeProfile);
    if (returnStatus) return { needsOnboarding: true, reason: 'profile_incomplete_or_stale', profile: activeProfile };
    return true;
  }

  persistProfile(projectRoot, activeProfile);
  if (returnStatus) return { needsOnboarding: false, reason: null, profile: activeProfile };
  return false;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  checkOnboarding,
  runOnboarding,
  validateProfile,
  scanProject,
  readLatestDbProfile,
  readOnboardingFile,
  // Exported for testing
  validateSubjectRoot,
  validateVerificationCommands,
  validateDangerZones,
  synthesizePrimeDirective,
  buildScanBriefing,
  inferRealConstraints,
  deriveFollowupQuestions,
  expandHome,
};
