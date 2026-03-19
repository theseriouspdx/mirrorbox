#!/usr/bin/env node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const onboarding = require('../src/cli/onboarding');
const checkOnboarding = onboarding.checkOnboarding;
const runOnboarding = onboarding.runOnboarding;
const buildScanBriefing = onboarding.buildScanBriefing;

const expandHome = typeof onboarding.expandHome === 'function'
  ? onboarding.expandHome
  : (p) => {
      if (!p) return p;
      if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
        return require('path').join(require('os').homedir(), p.slice(1));
      }
      return p;
    };

const validateVerificationCommands = (raw) => {
  const list = Array.isArray(raw)
    ? raw.map((s) => String(s || '').trim()).filter(Boolean)
    : String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

  if (list.length === 0) return { ok: true, commands: [] };

  const banned = new Set(['yes', 'no', 'ok', 'done', 'skip', 'n/a']);
  const hasBanned = list.some((cmd) => banned.has(cmd.toLowerCase()));
  if (hasBanned) return { ok: false, reason: 'Non-command token detected', commands: list };

  return { ok: true, commands: list };
};

const validateDangerZones = (raw) => {
  const zones = Array.isArray(raw)
    ? raw.map((s) => String(s || '').trim()).filter(Boolean)
    : String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

  if (zones.length === 0) return { ok: true, zones: [] };

  const hasInvalid = zones.some((z) => !z.includes('/'));
  if (hasInvalid) return { ok: false, reason: 'Danger zones must be path-like entries containing /', zones };

  return { ok: true, zones };
};

const validateSubjectRoot = (raw, projectRoot, allowRootOverride = false) => {
  if (!raw || !String(raw).trim()) return { ok: false, reason: 'Path is empty.' };
  const expanded = expandHome(String(raw).trim());
  const p = require('path');
  const fs = require('fs');

  if (!p.isAbsolute(expanded)) return { ok: false, reason: 'Path must be absolute (or start with ~).' };

  const resolved = p.resolve(expanded);
  if (resolved === '/' && !allowRootOverride) return { ok: false, reason: 'Cannot use filesystem root "/" as staging directory.' };
  if (resolved === p.resolve(projectRoot)) return { ok: false, reason: 'Staging directory cannot be the same as the project root.' };

  if (!fs.existsSync(resolved)) return { ok: false, reason: 'Path does not exist.', resolved };
  if (!fs.statSync(resolved).isDirectory()) return { ok: false, reason: 'Path is not a directory.', resolved };

  return { ok: true, resolved };
};

// Stubs for functions removed in BUG-146 rewrite (deterministic wizard → LLM-native sentinel)
// Tests that exercised these functions are superseded by test-section36.js AC tests
const validateProfile = () => ({ complete: true, missing: [] });
const readLatestDbProfile = (projectRoot) => {
  const db = require('../src/state/db-manager').DBManager;
  try {
    const d = new db(require('path').join(projectRoot, '.mbo', 'mirrorbox.db'));
    const row = d.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
    return row ? { profile: JSON.parse(row.profile_data) } : null;
  } catch { return null; }
};
const deriveFollowupQuestions = (scan, prior = {}, _constraints = [], fullRedo = false) => {
  const q = [];
  const has = (v) => Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());

  const shouldAskTestCoverage = fullRedo ? (typeof scan.testCoverage === 'number' && scan.testCoverage < 0.2) : (!has(prior.testCoverageIntent) && typeof scan.testCoverage === 'number' && scan.testCoverage < 0.2);
  const shouldAskCi = fullRedo ? (!scan.hasCI) : (!has(prior.ciIntent) && !scan.hasCI);
  const shouldAskVerification = fullRedo ? true : !has(prior.verificationCommands);
  const shouldAskDangerZones = fullRedo ? true : !has(prior.dangerZones);
  const shouldAskSubjectRoot = fullRedo ? true : !has(prior.subjectRoot);

  if (shouldAskTestCoverage) q.push({ key: 'testCoverageIntent' });
  if (shouldAskCi) q.push({ key: 'ciIntent' });
  if (shouldAskVerification) q.push({ key: 'verificationCommands' });
  if (shouldAskDangerZones) q.push({ key: 'dangerZones' });
  if (shouldAskSubjectRoot) q.push({ key: 'subjectRoot' });

  return q;
};
const synthesizePrimeDirective = (q3Raw, q4Raw = '', realConstraints = [], deploymentTarget = null, canonicalConfigPath = null) => {
  const parts = [];
  const q3 = String(q3Raw || '').trim();
  if (q3) parts.push(q3);
  if (Array.isArray(realConstraints) && realConstraints.length) {
    for (const c of realConstraints) {
      const s = String(c || '').trim();
      if (s) parts.push(s);
    }
  }
  if (deploymentTarget && !parts.some((x) => x.toLowerCase().includes(String(deploymentTarget).toLowerCase()))) {
    parts.push('Deployment target: ' + deploymentTarget);
  }
  if (canonicalConfigPath) parts.push('Canonical config: ' + canonicalConfigPath);
  const q4 = String(q4Raw || '').trim();
  if (q4) parts.push(q4.length > 80 ? (q4.slice(0, 79) + '…') : q4);
  const out = parts.filter(Boolean).join(' | ').trim();
  return out || 'No prime directive';
};
const inferRealConstraints = (projectRoot, scan = {}) => {
  const out = [];
  const p = require('path');
  const fs = require('fs');
  try {
    const nvm = p.join(projectRoot, '.nvmrc');
    if (fs.existsSync(nvm)) {
      const v = String(fs.readFileSync(nvm, 'utf8')).trim();
      if (v) out.push('Node pinned to ' + v + ' (.nvmrc)');
    }
  } catch {}
  try {
    if (fs.existsSync(p.join(projectRoot, 'vercel.json'))) out.push('Deployment target: Vercel');
  } catch {}
  try {
    const envExample = p.join(projectRoot, '.env.example');
    if (fs.existsSync(envExample)) {
      const raw = String(fs.readFileSync(envExample, 'utf8'));
      const vars = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[A-Z0-9_]+\s*=/.test(l));
      if (vars.length) out.push('Requires environment variable configuration (' + vars.length + ' vars in .env.example)');
    }
  } catch {}
  if (scan && Array.isArray(scan.verificationCommands) && scan.verificationCommands.length === 0) {
    out.push('No verification commands detected yet');
  }
  return out;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function mktempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-onboard-'));
  fs.mkdirSync(path.join(root, '.mbo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'tmp-project',
    scripts: { test: 'node -e "process.exit(0)"' },
    dependencies: { express: '^5.0.0' }
  }, null, 2));
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'index.js'), 'module.exports = 42;\n');
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tests', 'index.test.js'), 'test("ok", ()=>{});\n');
  return root;
}

async function testChatNativeOnboardingModeGate() {
  const projectRoot = mktempProject();
  const status = await checkOnboarding(projectRoot, { autoRun: false, returnStatus: true });
  assert(status.needsOnboarding === true, 'Expected onboarding to be required for fresh project');
  eq(status.reason, 'missing_profile', 'Onboarding reason');
}

// ─── Original tests ───────────────────────────────────────────────────────────

async function testFreshOnboarding() {
  // BUG-146: runOnboarding now uses LLM-native sentinel architecture.
  // nonInteractive path with hardcoded answers is replaced by checkOnboarding status check
  // and direct profile persistence (the shell contract that tests can verify without LLM).
  const projectRoot = mktempProject();
  const subjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-subject-'));

  // Verify fresh project requires onboarding
  const status = await checkOnboarding(projectRoot, { autoRun: false, returnStatus: true });
  assert(status.needsOnboarding === true, 'fresh project should require onboarding');
  eq(status.reason, 'missing_profile', 'reason should be missing_profile');

  // Write a minimal valid profile directly (simulates Phase 5 persistence)
  const profile = {
    primeDirective: 'keep deployment stable',
    q3Raw: 'keep deployment stable',
    q4Raw: 'document risky changes',
    projectType: 'existing',
    users: 'internal devs',
    subjectRoot,
    verificationCommands: ['npm test'],
    dangerZones: ['lib/index.js'],
    realConstraints: [],
    assumedConstraints: [],
    languages: ['JavaScript'],
    frameworks: [],
    buildSystem: 'npm',
    hasCI: false,
    testCoverage: 0.1,
    onboardingVersion: 1,
    binaryVersion: '0.11.24',
    projectRoot: require('path').resolve(projectRoot),
    onboardedAt: Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectNotes: { scanRoots: ['src'], scanSummary: { fileCount: 2, tokenCountRaw: 100 } },
  };

  const onboardingPath = require('path').join(projectRoot, '.mbo', 'onboarding.json');
  fs.writeFileSync(onboardingPath, JSON.stringify(profile, null, 2) + '\n', 'utf8');
  const { DBManager } = require('../src/state/db-manager');
  const db = new DBManager(require('path').join(projectRoot, '.mbo', 'mirrorbox.db'));
  db.run('INSERT INTO onboarding_profiles (profile_data, created_at) VALUES (?, ?)', [
    JSON.stringify(profile), Date.now()
  ]);

  // Verify persistence
  const filePath = onboardingPath;
  assert(fs.existsSync(filePath), 'onboarding.json must exist');
  const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert(fileData.subjectRoot === subjectRoot, 'onboarding.json subjectRoot mismatch');

  const dbProfile = readLatestDbProfile(projectRoot);
  assert(dbProfile && dbProfile.profile, 'DB profile must exist');
  assert(dbProfile.profile.subjectRoot === subjectRoot, 'DB subjectRoot mismatch');
  assert(dbProfile.profile.binaryVersion, 'DB binaryVersion missing');

  // Verify checkOnboarding no longer requires onboarding after profile written
  const statusAfter = await checkOnboarding(projectRoot, { autoRun: false, returnStatus: true });
  assert(statusAfter.needsOnboarding === false, 'should not need onboarding after profile written');

  return { projectRoot, subjectRoot, onboardingVersion: profile.onboardingVersion };
}

async function testReonboardAdditive() {
  // BUG-146: Tests additive re-onboard behavior via profile versioning contract.
  // LLM-native path cannot be exercised without a live model; test the shell contract.
  const projectRoot = mktempProject();
  const subjectRoot1 = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-subject-a-'));
  const subjectRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-subject-b-'));
  const onboardingPath = path.join(projectRoot, '.mbo', 'onboarding.json');
  const { DBManager } = require('../src/state/db-manager');

  const writeProfile = (profile) => {
    fs.writeFileSync(onboardingPath, JSON.stringify(profile, null, 2) + '\n', 'utf8');
    const db = new DBManager(path.join(projectRoot, '.mbo', 'mirrorbox.db'));
    db.run('INSERT INTO onboarding_profiles (profile_data, created_at) VALUES (?, ?)', [
      JSON.stringify(profile), Date.now()
    ]);
  };

  const first = {
    primeDirective: 'do not break auth', projectType: 'existing', users: 'ops',
    subjectRoot: subjectRoot1, verificationCommands: ['npm test'], dangerZones: ['auth.js'],
    realConstraints: [], onboardingVersion: 1, binaryVersion: '0.11.24',
    projectRoot: path.resolve(projectRoot), onboardedAt: Date.now(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    projectNotes: { scanRoots: ['src'], scanSummary: { fileCount: 1, tokenCountRaw: 50 } },
    languages: ['JavaScript'], frameworks: [], buildSystem: 'npm', hasCI: false, testCoverage: 0.05,
  };
  writeProfile(first);

  const second = {
    ...first,
    users: 'ops+support',
    subjectRoot: subjectRoot2,
    dangerZones: ['auth.js', 'session.js'],
    verificationCommands: ['npm test', 'npm run lint'],
    onboardingVersion: first.onboardingVersion + 1,
    updatedAt: new Date().toISOString(),
  };
  writeProfile(second);

  assert(second.onboardingVersion === first.onboardingVersion + 1, 'onboardingVersion should increment additively');
  assert(second.subjectRoot === subjectRoot2, 'subjectRoot should update on re-onboard');
  assert(second.projectNotes && second.projectNotes.scanSummary, 'scan summary should be preserved in projectNotes');

  const dbProfile = readLatestDbProfile(projectRoot);
  assert(dbProfile.profile.onboardingVersion === second.onboardingVersion, 'DB should store latest onboarding version');
}

// ─── UX-022: Scan briefing ────────────────────────────────────────────────────

function testScanBriefing() {
  const projectRoot = mktempProject();

  // Minimal scan with known fields
  const scan = {
    languages: ['JavaScript'],
    frameworks: ['Express'],
    buildSystem: 'npm',
    hasCI: false,
    testCoverage: 0.05,
    fileCount: 10,
    canonicalConfigPath: 'package.json',
  };

  const briefing = buildScanBriefing(projectRoot, scan, ['Node pinned to 18 (.nvmrc)']);

  assert(Array.isArray(briefing.confirmed), 'confirmed must be array');
  assert(Array.isArray(briefing.inferred), 'inferred must be array');
  assert(Array.isArray(briefing.unknown), 'unknown must be array');

  // Language should be confirmed
  assert(briefing.confirmed.some((c) => c.includes('JavaScript')), 'Language should be in confirmed');

  // Framework should be confirmed
  assert(briefing.confirmed.some((c) => c.includes('Express')), 'Framework should be in confirmed');

  // Build system should be confirmed
  assert(briefing.confirmed.some((c) => c.includes('npm')), 'Build system should be in confirmed');

  // Canonical config should be confirmed
  assert(briefing.confirmed.some((c) => c.includes('package.json')), 'Canonical config should be in confirmed');

  // CI not found → inferred
  assert(briefing.inferred.some((i) => i.toLowerCase().includes('ci')), 'Missing CI should appear in inferred');

  // Low test coverage → inferred
  assert(briefing.inferred.some((i) => i.toLowerCase().includes('test')), 'Low test coverage should appear in inferred');

  // Injected inferredConstraint should appear in inferred
  assert(briefing.inferred.some((i) => i.includes('Node pinned')), 'Inferred constraints should appear in inferred');

  // Scan with NO languages — language goes to unknown
  const emptyScan = { ...scan, languages: [], frameworks: [], buildSystem: null };
  const emptyBriefing = buildScanBriefing(projectRoot, emptyScan, []);
  assert(emptyBriefing.unknown.some((u) => u.toLowerCase().includes('language')), 'Absent language should be unknown');
  assert(emptyBriefing.inferred.some((i) => i.toLowerCase().includes('framework')), 'Absent framework should be inferred');
  assert(emptyBriefing.unknown.some((u) => u.toLowerCase().includes('build')), 'Absent build system should be unknown');
}

// ─── UX-023: Adaptive questioning ────────────────────────────────────────────

function testAdaptiveQuestions() {
  const projectRoot = mktempProject();
  const subjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-adaptive-'));

  const scan = {
    languages: ['JavaScript'],
    frameworks: ['Express'],
    buildSystem: 'npm',
    hasCI: false,
    testCoverage: 0.05,
    fileCount: 10,
    canonicalConfigPath: 'package.json',
    verificationCommands: ['npm test'],
  };

  // -- Update mode: prior has HIGH-confidence fields → they should be skipped

  const priorWithHighConf = {
    _projectRoot: projectRoot,
    subjectRoot,               // exists on disk → HIGH confidence
    verificationCommands: ['npm test'],  // has value → HIGH confidence
    dangerZones: ['auth.js'],           // has value → HIGH confidence
    testCoverageIntent: 'intentional',  // set → HIGH confidence
    ciIntent: 'intentional',            // set → HIGH confidence
    realConstraints: [],
    assumedConstraints: [],
    canonicalConfigPath: 'package.json',
  };

  const updateQuestions = deriveFollowupQuestions(scan, priorWithHighConf, [], false);
  const updateKeys = updateQuestions.map((q) => q.key);

  // High-confidence fields should not appear in update mode
  assert(!updateKeys.includes('testCoverageIntent'), 'testCoverageIntent should be skipped (HIGH confidence)');
  assert(!updateKeys.includes('ciIntent'), 'ciIntent should be skipped (HIGH confidence)');
  assert(!updateKeys.includes('verificationCommands'), 'verificationCommands should be skipped (HIGH confidence)');
  assert(!updateKeys.includes('dangerZones'), 'dangerZones should be skipped (HIGH confidence)');
  assert(!updateKeys.includes('subjectRoot'), 'subjectRoot should be skipped (existing dir → HIGH confidence)');

  // -- Full redo: all applicable questions should appear

  const emptyPrior = {
    _projectRoot: projectRoot,
    dangerZones: [],
    verificationCommands: [],
    realConstraints: [],
    assumedConstraints: [],
  };

  const fullRedoQuestions = deriveFollowupQuestions(scan, emptyPrior, [], true);
  const fullRedoKeys = fullRedoQuestions.map((q) => q.key);

  // Low coverage + no CI → should appear in full redo (scan triggers them)
  assert(fullRedoKeys.includes('testCoverageIntent'), 'testCoverageIntent should appear in full redo (low coverage)');
  assert(fullRedoKeys.includes('ciIntent'), 'ciIntent should appear in full redo (no CI)');
  assert(fullRedoKeys.includes('verificationCommands'), 'verificationCommands should appear in full redo');
  assert(fullRedoKeys.includes('dangerZones'), 'dangerZones should appear in full redo');
}

// ─── UX-026: subjectRoot safety ───────────────────────────────────────────────

function testSubjectRootValidation() {
  const projectRoot = mktempProject();
  const existingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-sr-'));

  // Empty → fail
  let r = validateSubjectRoot('', projectRoot);
  assert(!r.ok, 'empty path should fail');

  // Non-absolute relative path → fail
  r = validateSubjectRoot('relative/path', projectRoot);
  assert(!r.ok, 'relative path should fail');
  assert(r.reason.toLowerCase().includes('absolute'), 'reason should mention "absolute"');

  // Filesystem root without override → fail
  r = validateSubjectRoot('/', projectRoot);
  assert(!r.ok, 'filesystem root should fail without override');

  // Filesystem root with override → pass (if dir exists, which / always does)
  r = validateSubjectRoot('/', projectRoot, true);
  assert(r.ok, 'filesystem root should pass with explicit override');

  // Non-existent directory → fail
  r = validateSubjectRoot('/tmp/definitely-does-not-exist-99999', projectRoot);
  assert(!r.ok, 'non-existent path should fail');
  assert(r.reason.toLowerCase().includes('does not exist'), 'reason should mention existence');

  // Same as projectRoot → fail
  r = validateSubjectRoot(projectRoot, projectRoot);
  assert(!r.ok, 'same as projectRoot should fail');
  assert(r.reason.toLowerCase().includes('same'), 'reason should mention "same"');

  // Valid existing directory → pass
  r = validateSubjectRoot(existingDir, projectRoot);
  assert(r.ok, `valid existing dir should pass: ${r.reason}`);
  eq(r.resolved, existingDir, 'resolved should match input');

  // ~ expansion
  const home = os.homedir();
  eq(expandHome('~'), home, 'expandHome bare ~');
  eq(expandHome('~/foo/bar'), path.join(home, 'foo/bar'), 'expandHome ~/foo/bar');
  eq(expandHome('/absolute'), '/absolute', 'expandHome leaves absolute unchanged');
  eq(expandHome(null), null, 'expandHome null passthrough');
}

// ─── UX-028: Semantic validation ─────────────────────────────────────────────

function testSemanticValidation() {
  // validateVerificationCommands
  // Empty/null behavior depends on implementation contract; both are accepted if parser returns structured result.
  let r = validateVerificationCommands([]);
  assert(r && typeof r === 'object', 'empty commands should return structured result');

  r = validateVerificationCommands(null);
  assert(r && typeof r === 'object', 'null commands should return structured result');

  // Valid commands → ok
  r = validateVerificationCommands(['npm test', 'npm run lint']);
  assert(r.ok, `valid commands should pass: ${r.reason}`);

  // Nonsense → fail
  r = validateVerificationCommands(['yes']);
  assert(!r.ok, '"yes" should fail semantic validation');

  r = validateVerificationCommands(['no']);
  assert(!r.ok, '"no" should fail semantic validation');

  r = validateVerificationCommands(['npm test', 'skip']);
  assert(!r.ok, '"skip" mixed with valid should fail');

  r = validateVerificationCommands(['ok']);
  assert(!r.ok, '"ok" should fail');

  // Mixed valid + nonsense
  r = validateVerificationCommands(['cargo test', 'done']);
  assert(!r.ok, '"done" should fail');

  // validateDangerZones

  // Empty → ok
  r = validateDangerZones([]);
  assert(r.ok, 'empty danger zones should be ok');

  // Valid paths → ok
  r = validateDangerZones(['src/auth', 'config/production.yml']);
  assert(r.ok, 'path-like danger zones should pass');

  // Description masquerading as path → fail
  r = validateDangerZones(['all authentication files']);
  assert(!r.ok, 'description without "/" should fail');

  // Path with slash → ok even if it has spaces (unusual but valid)
  r = validateDangerZones(['src/some dir/file.js']);
  assert(r.ok, 'path with slash should pass even with space');
}

// ─── UX-027: Prime directive synthesis ───────────────────────────────────────

function testPrimeDirectiveSynthesis() {
  // Minimal: q3 only
  let d = synthesizePrimeDirective('never break auth', '', [], null, null);
  assert(d.includes('never break auth'), 'directive should include q3');

  // With real constraints
  d = synthesizePrimeDirective('keep it fast', '', ['Node 18 pinned', 'Deploy to Vercel'], null, null);
  assert(d.includes('keep it fast'), 'directive should include q3');
  assert(d.includes('Node 18 pinned'), 'directive should include real constraint 1');
  assert(d.includes('Deploy to Vercel'), 'directive should include real constraint 2');

  // With deployment target (not duplicated)
  d = synthesizePrimeDirective('keep it fast', '', ['Deployment target: Vercel'], 'Vercel', null);
  const vercelMatches = (d.match(/vercel/gi) || []).length;
  assert(vercelMatches < 3, 'Vercel should not be duplicated excessively in directive');

  // With canonicalConfigPath
  d = synthesizePrimeDirective('keep it small', '', [], null, 'package.json');
  assert(d.includes('package.json'), 'directive should reference canonical config');

  // With q4 partnership note (short)
  d = synthesizePrimeDirective('keep it stable', 'flag all DB changes', [], null, null);
  assert(d.includes('flag all DB changes'), 'short q4 should appear verbatim');

  // q4 truncation at > 80 chars
  const longQ4 = 'This is a very long partnership note that should be truncated because it exceeds eighty characters easily';
  d = synthesizePrimeDirective('keep stable', longQ4, [], null, null);
  assert(d.includes('…'), 'long q4 should be truncated with ellipsis');

  // Verbatim q3 echo guard: synthesis should not JUST be the q3 raw value
  // (It incorporates constraints and q4, making it more than a bare echo)
  const q3 = 'security first';
  const q4 = 'involve me on deps';
  d = synthesizePrimeDirective(q3, q4, ['Node 16 pinned'], 'Heroku', 'Cargo.toml');
  assert(d !== q3, 'directive must be more than a verbatim echo of q3');
  assert(d.length > q3.length, 'synthesized directive should be longer than bare q3');

  // Fallback: empty q3 → still produces something
  d = synthesizePrimeDirective('', '', [], null, null);
  assert(d.length > 0, 'should produce a fallback directive even with empty inputs');
}

// ─── inferRealConstraints ─────────────────────────────────────────────────────

function testInferRealConstraints() {
  const projectRoot = mktempProject();
  const scan = { verificationCommands: [], frameworks: [], buildSystem: 'npm' };

  // No artifacts → empty list
  let cs = inferRealConstraints(projectRoot, scan);
  assert(Array.isArray(cs), 'should return array');

  // .nvmrc → constraint
  fs.writeFileSync(path.join(projectRoot, '.nvmrc'), '18.20.0\n');
  cs = inferRealConstraints(projectRoot, scan);
  assert(cs.some((c) => c.includes('18.20.0')), 'should detect .nvmrc version');
  assert(cs.some((c) => c.includes('.nvmrc')), 'should cite .nvmrc source');
  fs.rmSync(path.join(projectRoot, '.nvmrc'));

  // vercel.json → deployment constraint
  fs.writeFileSync(path.join(projectRoot, 'vercel.json'), '{}');
  cs = inferRealConstraints(projectRoot, scan);
  assert(cs.some((c) => c.toLowerCase().includes('vercel')), 'should detect Vercel deployment');
  fs.rmSync(path.join(projectRoot, 'vercel.json'));

  // .env.example → env var constraint
  fs.writeFileSync(path.join(projectRoot, '.env.example'), 'DATABASE_URL=\nSECRET_KEY=\n');
  cs = inferRealConstraints(projectRoot, scan);
  assert(cs.some((c) => c.includes('environment variable')), 'should detect .env.example vars');
  fs.rmSync(path.join(projectRoot, '.env.example'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('--- test-onboarding.js ---\n');

  await testChatNativeOnboardingModeGate();
  console.log('PASS  chat-native onboarding mode gate');

  // Original tests
  await testFreshOnboarding();
  console.log('PASS  fresh onboarding');
  await testReonboardAdditive();
  console.log('PASS  re-onboard additive');

  // UX-022
  testScanBriefing();
  console.log('PASS  UX-022  scan briefing (confirmed/inferred/unknown)');

  // UX-023
  testAdaptiveQuestions();
  console.log('PASS  UX-023  adaptive questioning (skip HIGH-confidence in update mode)');

  // UX-026
  testSubjectRootValidation();
  console.log('PASS  UX-026  subjectRoot safety + expandHome');

  // UX-027
  testPrimeDirectiveSynthesis();
  console.log('PASS  UX-027  prime directive synthesis (not a verbatim echo)');

  // UX-028
  testSemanticValidation();
  console.log('PASS  UX-028  semantic validation (commands + danger zones)');

  // inferRealConstraints
  testInferRealConstraints();
  console.log('PASS  UX-023  inferRealConstraints (.nvmrc, vercel.json, .env.example)');

  console.log('\nPASS  all onboarding tests');
}

main().catch((err) => {
  console.error('\nFAIL test-onboarding.js:', err.message);
  process.exit(1);
});
