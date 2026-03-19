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

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  TEAL: '\x1b[36m',
  GREY: '\x1b[90m',
  RESET: '\x1b[0m',
};

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
        rl.question(`MBO ${version} > `, (answer) => {
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

function buildScanBriefing(projectRoot, scan) {
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

  confirmed.push(`Files scanned: ${scan.fileCount} (~${scan.tokenCountRaw} tokens)`);
  if (scan.fileCount === 0) {
    confirmed[confirmed.length - 1] += ` ${C.GREY}(scan root may be misconfigured — check scanRoots in .mbo/config.json)${C.RESET}`;
  }

  return { confirmed, inferred, unknown };
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

// ─── Conversational Logic (The Shell) ──────────────────────────────────────────

async function runOnboarding(projectRoot, priorData = null, options = {}, io = null) {
  const currentIO = io || (options.nonInteractive ? { ask: async (_, def) => def || '', close: () => {} } : createPromptIO());
  
  try {
    // Phase 1 & 2: Background Scan & Briefing
    process.stdout.write(`\n${C.GREY}[Scan] Scanning your codebase...${C.RESET}`);
    const scan = scanProject(projectRoot);
    process.stdout.write('\r');
    
    const briefing = buildScanBriefing(projectRoot, scan);
    printScanBriefing(briefing);

    console.log(`Welcome to Mirror Box Orchestrator v${version}`);
    console.log(`Please spend a few minutes to help us get acquainted with you and your project.
Feel free to ask for clarification on any question, or go back to a previous question, or ask for help.\n`);

    let transcript = `System: Welcome. Scan complete. Briefing shown.\nConfirmed: ${briefing.confirmed.join(', ')}\nInferred: ${briefing.inferred.join(', ')}\nUnknown: ${briefing.unknown.join(', ')}\n\n`;
    let profile = null;

    // Phase 3 & 4: Interview Loop
    while (true) {
      const response = await callModel('onboarding', `I am performing the conversational onboarding (Section 36) for this project.
Based on the transcript so far and the project scan, what is your next question or action?
Follow Section 36 principles: One Turn, One Question. Proactively seed Q3 (Prime Directive) and Q4 (Personality).
If the interview is complete and the user has accepted the synthesis, return a JSON object with 'type: "persist"' and the full 'profile' data.
Otherwise, return a JSON object with 'type: "question"', 'text', 'defaultValue', 'helpText', and optional 'key'.

Scan Data: ${JSON.stringify(scan)}
Current Transcript:
${transcript}`, { priorData });

      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch {
        parsed = { type: 'question', text: response };
      }

      if (parsed.type === 'persist') {
        profile = parsed.profile;
        break;
      }

      // Handle Staging Directory logic separately (Section 36.5 / BUG-122 / BUG-123)
      if (parsed.key === 'subjectRoot') {
        const optIn = await currentIO.ask('Use an external staging directory? (default: no, uses .dev/worktree/)', 'N', 'MBO uses a "Mirror Box" to safely stage and verify changes. By default, it uses an internal worktree in .dev/worktree. If you prefer to stage in a specific external directory, say "y".');
        if (optIn.toLowerCase() !== 'y') {
          transcript += `MBO: Use external staging? User: No. (Defaulting to .dev/worktree/)\n`;
          continue; 
        }
      }

      const answer = await currentIO.ask(parsed.text, parsed.defaultValue, parsed.helpText);
      transcript += `MBO: ${parsed.text}\nUser: ${answer}\n`;

      // Conversational corrections and staging auto-create (BUG-122)
      if (parsed.key === 'subjectRoot' && answer) {
        const val = validateSubjectRoot(answer, projectRoot);
        if (!val.ok && val.reason === 'does_not_exist') {
          const confirm = await currentIO.ask(`The directory "${val.path}" doesn't exist yet. Create it now?`, 'Y');
          if (confirm.toLowerCase() === 'y') {
            try {
              fs.mkdirSync(val.path, { recursive: true });
              transcript += `System: Directory ${val.path} created.\n`;
            } catch (e) {
              console.log(`\n${C.GREY}Could not create directory: ${e.message}${C.RESET}\n`);
              transcript += `System: Failed to create ${val.path}: ${e.message}\n`;
            }
          }
        }
      }
    }

    // Phase 5: Atomic Persistence
    profile.projectRoot = path.resolve(projectRoot); // BUG-086 fix round 2
    persistProfile(projectRoot, profile);
    console.log(`\n[Onboarding] Done. Working agreement locked in.`);
    return profile;

  } catch (err) {
    console.error(`\nSomething went wrong: ${err.message}.`);
    console.log(`Run 'mbo setup --verbose' for diagnostic output.\n`);
    throw err;
  } finally {
    if (currentIO.close) currentIO.close();
  }
}

async function checkOnboarding(projectRoot) {
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  
  if (fs.existsSync(onboardingPath)) {
    // BUG-086: Validate project root match
    try {
      const profile = JSON.parse(fs.readFileSync(onboardingPath, 'utf8'));
      const canonicalCwd = fs.realpathSync(projectRoot);
      const canonicalStored = profile.projectRoot ? fs.realpathSync(profile.projectRoot) : null;

      if (canonicalCwd !== canonicalStored) {
        console.warn(`\n[SYSTEM] Project root mismatch detected (stored: ${profile.projectRoot || 'unknown — profile predates root-tracking'}). Triggering re-onboarding.`);
        if (isTTY()) {
          await runOnboarding(projectRoot);
          return true;
        }
      } else {
        return false; // Valid match, skip
      }
    } catch (e) {
      // Corrupt or pre-root profile
      if (isTTY()) {
        await runOnboarding(projectRoot);
        return true;
      }
    }
  }
  
  if (isTTY()) {
    await runOnboarding(projectRoot);
    return true;
  }
  return false;
}

module.exports = {
  checkOnboarding,
  runOnboarding,
  scanProject,
  buildScanBriefing,
};
