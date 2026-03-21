#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

function sh(cmd, cwd) {
  return cp.execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) return false;
  mkdirp(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return true;
}

function nowTs() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function usage() {
  console.log('Usage: node scripts/generate-run-artifacts.js --task <task-id> [--run-id <id>] [--operator <name>] [--branch <name>] [--world mirror|subject] [--transcript <path>] [--checklist <path>] [--auto-changelog]');
}

function parseArgs(argv) {
  const out = {
    task: '', runId: '', operator: '', branch: '', world: 'mirror', transcript: '', checklist: '', autoChangelog: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i] || '';
    else if (a === '--run-id') out.runId = argv[++i] || '';
    else if (a === '--operator') out.operator = argv[++i] || '';
    else if (a === '--branch') out.branch = argv[++i] || '';
    else if (a === '--world') out.world = argv[++i] || 'mirror';
    else if (a === '--transcript') out.transcript = argv[++i] || '';
    else if (a === '--checklist') out.checklist = argv[++i] || '';
    else if (a === '--auto-changelog') out.autoChangelog = true;
    else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  }
  return out;
}

function findLatestFile(dir, re) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir)
    .map((n) => ({ n, p: path.join(dir, n) }))
    .filter((e) => fs.statSync(e.p).isFile() && re.test(e.n))
    .sort((a, b) => fs.statSync(b.p).mtimeMs - fs.statSync(a.p).mtimeMs);
  return entries.length ? entries[0].p : null;
}

function readTaskExists(projecttrackingPath, taskId) {
  if (!taskId) return false;
  const text = fs.readFileSync(projecttrackingPath, 'utf8');
  return text.split('\n').some((line) => line.startsWith('|') && line.includes(`| ${taskId} |`));
}

function collectChangedFiles(root) {
  try {
    const out = sh('git diff --name-only HEAD', root);
    const files = out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    const allowedPrefixes = ['src/', 'bin/', 'scripts/', 'docs/', '.dev/governance/'];
    const allowedSingletons = new Set(['README.md', 'package.json', 'package-lock.json']);
    const excludedPatterns = [
      /^backups\//,
      /^\.mbo\//,
      /^\.dev\/sessions\//,
      /__pycache__/,
      /\.pyc$/,
    ];

    return files.filter((f) => {
      if (!f) return false;
      if (excludedPatterns.some((re) => re.test(f))) return false;
      if (allowedSingletons.has(f)) return true;
      return allowedPrefixes.some((p) => f.startsWith(p));
    });
  } catch (_) {
    return [];
  }
}

function parseTraceabilityFiles(checklistText) {
  const lines = checklistText.split('\n');
  let inSection = false;
  let files = [];
  for (const line of lines) {
    if (line.startsWith('### 3.1 Traceability')) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('### ')) break;
    if (!inSection) continue;
    if (!line.trim().startsWith('|')) continue;
    const cols = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cols.length < 5) continue;
    if (cols[0] === 'File Changed' || cols[0] === '---') continue;
    const f = cols[0].replace(/^`|`$/g, '').trim();
    if (f && f !== 'path/to/file') files.push(f);
  }
  return [...new Set(files)];
}

function parseWeightedScores(checklistText) {
  const lines = checklistText.split('\n');
  let inWeighted = false;
  const rows = [];
  for (const line of lines) {
    if (line.startsWith('## 6) Weighted Scorecard')) {
      inWeighted = true;
      continue;
    }
    if (inWeighted && line.startsWith('## ') && !line.startsWith('## 6)')) break;
    if (!inWeighted) continue;
    if (!line.trim().startsWith('|')) continue;
    const cols = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cols.length < 3) continue;
    if (cols[0] === 'Category' || cols[0] === '---') continue;
    rows.push(cols);
  }
  return rows;
}

function parseScoreTotal(checklistText) {
  const m = checklistText.match(/^-\s+Score Total:\s*(.+)$/m);
  if (!m) return null;
  const n = m[1].match(/(\d{1,3})/);
  return n ? Number(n[1]) : null;
}

function appendChangelogLine(changelogPath, line) {
  const current = fs.readFileSync(changelogPath, 'utf8');
  if (current.includes(line)) return false;
  const marker = '### Added';
  if (current.includes(marker)) {
    const next = current.replace(marker, `${marker}\n- ${line}`);
    fs.writeFileSync(changelogPath, next, 'utf8');
    return true;
  }
  fs.writeFileSync(changelogPath, `${current.trimEnd()}\n\n- ${line}\n`, 'utf8');
  return true;
}

function main() {
  const root = process.env.MBO_PROJECT_ROOT ? path.resolve(process.env.MBO_PROJECT_ROOT) : process.cwd();
  const args = parseArgs(process.argv.slice(2));
  if (!args.task) {
    console.error('ERROR: --task is required');
    usage();
    process.exit(2);
  }

  const projecttracking = path.join(root, '.dev', 'governance', 'projecttracking.md');
  if (!fs.existsSync(projecttracking)) {
    console.error(`ERROR: Missing ${projecttracking}`);
    process.exit(1);
  }
  if (!readTaskExists(projecttracking, args.task)) {
    console.error(`ERROR: Task '${args.task}' is not present in .dev/governance/projecttracking.md`);
    process.exit(1);
  }

  const runId = args.runId || `${args.task}-${nowTs()}`;
  const runDir = path.join(root, '.mbo', 'runs', runId);
  mkdirp(runDir);

  const branch = args.branch || (() => {
    try { return sh('git rev-parse --abbrev-ref HEAD', root); } catch (_) { return 'unknown'; }
  })();
  const commit = (() => {
    try { return sh('git rev-parse HEAD', root); } catch (_) { return 'unknown'; }
  })();
  const operator = args.operator || process.env.USER || 'unknown';

  const defaultChecklist = path.join(root, 'docs', 'e2e-audit-checklist.md');
  const checklistSrc = args.checklist ? path.resolve(root, args.checklist) : defaultChecklist;
  if (fs.existsSync(checklistSrc)) {
    copyIfExists(checklistSrc, path.join(runDir, 'e2e-audit-checklist.md'));
  }

  const transcriptSrc = args.transcript
    ? path.resolve(root, args.transcript)
    : findLatestFile(path.join(root, '.mbo', 'logs'), /^mbo-e2e-.*\.log$/);
  if (transcriptSrc) {
    copyIfExists(transcriptSrc, path.join(runDir, path.basename(transcriptSrc)));
  }

  const mirrorCopy = findLatestFile(path.join(root, '.dev', 'sessions', 'analysis'), /^mbo-e2e-.*\.log\.copy$/);
  if (mirrorCopy) {
    copyIfExists(mirrorCopy, path.join(runDir, path.basename(mirrorCopy)));
  }

  let validatorOut = '';
  try {
    validatorOut = sh('python3 bin/validator.py --all', root);
  } catch (err) {
    validatorOut = String(err.stdout || err.stderr || err.message || 'validator failed');
  }
  fs.writeFileSync(path.join(runDir, 'validator-output.txt'), `${validatorOut}\n`, 'utf8');

  let testOut = '';
  try {
    testOut = sh('node scripts/test-invariants.js', root);
  } catch (err) {
    testOut = String(err.stdout || err.stderr || err.message || 'test-invariants failed');
  }
  fs.writeFileSync(path.join(runDir, 'test-invariants-output.txt'), `${testOut}\n`, 'utf8');

  const changed = collectChangedFiles(root);
  fs.writeFileSync(path.join(runDir, 'changed-files.txt'), changed.join('\n') + (changed.length ? '\n' : ''), 'utf8');

  const checklistPath = path.join(runDir, 'e2e-audit-checklist.md');
  const traceability = fs.existsSync(checklistPath)
    ? parseTraceabilityFiles(fs.readFileSync(checklistPath, 'utf8'))
    : [];
  const checklistText = fs.existsSync(checklistPath) ? fs.readFileSync(checklistPath, 'utf8') : '';
  const weightedRows = checklistText ? parseWeightedScores(checklistText) : [];
  const scoreTotal = checklistText ? parseScoreTotal(checklistText) : null;

  const missingTraceability = changed.filter((f) => !traceability.includes(f));
  const darkCode = {
    runId,
    task: args.task,
    changedFiles: changed,
    traceabilityFiles: traceability,
    missingTraceability,
    status: missingTraceability.length === 0 ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(path.join(runDir, 'dark-code-report.json'), JSON.stringify(darkCode, null, 2) + '\n', 'utf8');

  const scorecard = {
    runId,
    weightedRows: weightedRows.map((r) => ({ category: r[0], weight: r[1], scoreEarned: r[2] })),
    scoreTotal,
  };
  fs.writeFileSync(path.join(runDir, 'scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n', 'utf8');

  const governanceFiles = [
    path.join(root, '.dev', 'governance', 'AGENTS.md'),
    path.join(root, '.dev', 'governance', 'projecttracking.md'),
    path.join(root, '.dev', 'governance', 'BUGS.md'),
  ];
  const governanceState = {
    generatedAt: new Date().toISOString(),
    runId,
    task: args.task,
    operator,
    branch,
    world: args.world,
    commit,
    governanceFiles: governanceFiles.map((p) => ({
      path: path.relative(root, p),
      sha256: fs.existsSync(p) ? sha256File(p) : null,
    })),
  };
  fs.writeFileSync(path.join(runDir, 'governance_state.json'), JSON.stringify(governanceState, null, 2) + '\n', 'utf8');

  const filesForManifest = fs.readdirSync(runDir)
    .filter((n) => fs.statSync(path.join(runDir, n)).isFile())
    .sort();
  const lines = filesForManifest.map((n) => `${sha256File(path.join(runDir, n))}  ${n}`);
  fs.writeFileSync(path.join(runDir, 'sha256sums.txt'), lines.join('\n') + '\n', 'utf8');

  if (args.autoChangelog) {
    const changelog = path.join(root, '.dev', 'governance', 'CHANGELOG.md');
    if (fs.existsSync(changelog)) {
      const rel = path.relative(root, path.join(runDir, 'governance_state.json'));
      const line = `Run artifact (${args.task}): governance snapshot -> ${rel}`;
      appendChangelogLine(changelog, line);
    }
  }

  if (missingTraceability.length) {
    console.error(`DARK_CODE FAIL: ${missingTraceability.length} changed file(s) missing traceability mapping.`);
    console.error(`See: ${path.join(runDir, 'dark-code-report.json')}`);
    process.exit(1);
  }

  console.log(`Run artifacts generated: ${runDir}`);
  console.log(`Governance snapshot: ${path.join(runDir, 'governance_state.json')}`);
}

main();
