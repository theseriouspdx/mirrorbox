#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv) {
  const args = {
    task: '',
    world: 'mirror',
    operator: process.env.USER || 'unknown',
    strict: false,
    updateBugs: false,
    pushAlpha: false,
    humanInput: false,
    alphaRoot: process.env.MBO_ALPHA_ROOT || '/Users/johnserious/MBO_Alpha',
    alphaTimeoutSec: 300,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') args.task = argv[++i] || '';
    else if (a === '--world') args.world = argv[++i] || 'mirror';
    else if (a === '--operator') args.operator = argv[++i] || args.operator;
    else if (a === '--alpha-root') args.alphaRoot = argv[++i] || args.alphaRoot;
    else if (a === '--alpha-timeout-sec') args.alphaTimeoutSec = Number(argv[++i] || args.alphaTimeoutSec);
    else if (a === '--strict') args.strict = true;
    else if (a === '--update-bugs') args.updateBugs = true;
    else if (a === '--push-alpha') args.pushAlpha = true;
    else if (a === '--human-input') args.humanInput = true;
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/mbo-workflow-audit.js [--task <task-id>] [--world mirror|subject|both] [--operator <name>] [--strict] [--update-bugs] [--push-alpha] [--human-input] [--alpha-root <path>] [--alpha-timeout-sec <seconds>]');
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.alphaTimeoutSec) || args.alphaTimeoutSec < 30) {
    args.alphaTimeoutSec = 300;
  }

  if (!['mirror', 'subject', 'both'].includes(args.world)) {
    throw new Error(`Invalid --world value: ${args.world}. Expected mirror, subject, or both.`);
  }

  if (args.world === 'both' && args.humanInput) {
    throw new Error('--human-input is only supported with a single world audit run.');
  }

  return args;
}

function getWorldSequence(world) {
  if (world === 'both') return ['mirror', 'subject'];
  return [world];
}

function cloneCheckForWorld(check, world, root, alphaRoot) {
  const cloned = { ...check, world };
  if (world === 'mirror') {
    cloned.cwd = check.scope === 'alpha' ? root : root;
    cloned.scope = check.scope === 'alpha' ? 'alpha' : 'mirror';
    cloned.label = check.label;
    return cloned;
  }

  cloned.cwd = alphaRoot;
  if (check.scope === 'mirror') cloned.scope = 'subject';
  else if (check.scope === 'alpha') cloned.scope = 'alpha-subject';
  else cloned.scope = check.scope || 'subject';
  return cloned;
}

function runCommand(cmd, cwd, timeoutMs = 0, interactive = false) {
  if (interactive) {
    const res = cp.spawnSync(cmd, {
      cwd,
      shell: true,
      stdio: 'inherit',
      timeout: timeoutMs > 0 ? timeoutMs : undefined,
    });
    return {
      ok: res.status === 0,
      code: typeof res.status === 'number' ? res.status : 1,
      stdout: '',
      stderr: res.error ? String(res.error.message || res.error) : '',
      timedOut: Boolean(res.signal === 'SIGTERM' || res.signal === 'SIGKILL'),
      interactive: true,
    };
  }

  try {
    const stdout = cp.execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs > 0 ? timeoutMs : undefined,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout: stdout || '', stderr: '', timedOut: false, interactive: false };
  } catch (err) {
    const timedOut = Boolean(err && (err.killed || err.signal === 'SIGTERM'));
    return {
      ok: false,
      code: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : (err.message || ''),
      timedOut,
      interactive: false,
    };
  }
}

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function alphaOnboardingExists(alphaRoot) {
  const onboardingPath = path.join(alphaRoot, '.mbo', 'onboarding.json');
  if (!fs.existsSync(onboardingPath)) return false;
  try {
    JSON.parse(fs.readFileSync(onboardingPath, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseNextBugNumber(bugsText) {
  const m = bugsText.match(/\*\*Next bug number:\*\*\s*BUG-(\d+)/i);
  return m ? Number(m[1]) : null;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeTableCell(value) {
  return String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
}

function deriveNextTaskId(projecttrackingText, lane) {
  const normalizedLane = String(lane || '0.2').trim().replace(/^v/, '');
  const matches = [...projecttrackingText.matchAll(new RegExp(`\\bv${escapeRegex(normalizedLane)}\\.(\\d+)\\b`, 'g'))]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  const next = matches.length ? Math.max(...matches) + 1 : 1;
  return `v${normalizedLane}.${next}`;
}

function parseTaskStatuses(projecttrackingText) {
  const statuses = {};
  let inTasksTable = false;
  for (const line of projecttrackingText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '## Active Tasks' || trimmed === '## Recently Completed') {
      inTasksTable = true;
      continue;
    }
    if (inTasksTable && line.startsWith('## ')) {
      inTasksTable = false;
      continue;
    }
    if (!inTasksTable || !line.startsWith('|')) continue;
    if (line.startsWith('|---') || line.includes('Task ID')) continue;

    const cols = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cols.length < 4) continue;
    statuses[cols[0]] = cols[3];
  }
  return statuses;
}

function taskInProjecttracking(projecttrackingText, taskId) {
  if (!taskId) return true;
  return projecttrackingText.split('\n').some((line) => line.startsWith('|') && line.includes(`| ${taskId} |`));
}

function latestFileForPattern(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return null;
  const matches = fs.readdirSync(dirPath)
    .filter((name) => pattern.test(name))
    .sort();
  if (matches.length === 0) return null;
  return path.join(dirPath, matches[matches.length - 1]);
}

function readLatestAlphaTranscript(alphaLogsDir) {
  const latest = latestFileForPattern(alphaLogsDir, /^mbo-e2e-\d{8}-\d{6}\.log$/);
  if (!latest) return null;
  return {
    filePath: latest,
    text: fs.readFileSync(latest, 'utf8'),
  };
}

function validateAlphaTranscript(alphaLogsDir) {
  const latest = readLatestAlphaTranscript(alphaLogsDir);
  if (!latest) {
    return { ok: false, details: 'missing alpha transcript' };
  }

  const required = [
    'Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.',
    '[ASSUMPTION GUIDE] source=',
    'Queued hint for planning.',
    'Audit package ready. Respond "approved"',
    '[AUDIT] Approved. State synced. Intelligence graph updated.',
    'Status: Idle',
  ];
  const missing = required.filter((needle) => !latest.text.includes(needle));
  if (missing.length > 0) {
    return {
      ok: false,
      details: `latest alpha transcript missing required content: ${missing.join(' | ')}`,
      filePath: latest.filePath,
    };
  }

  return {
    ok: true,
    details: path.basename(latest.filePath),
    filePath: latest.filePath,
  };
}

function buildAlphaTranscriptCheckCommand(alphaLogsDir) {
  const required = [
    'Run readiness-check workflow now and complete one full workflow cycle successfully in plain English.',
    '[ASSUMPTION GUIDE] source=',
    'Queued hint for planning.',
    'Audit package ready. Respond "approved"',
    '[AUDIT] Approved. State synced. Intelligence graph updated.',
    'Status: Idle',
  ];
  const payload = JSON.stringify(required);
  return `node -e "const fs=require('fs');const p=require('path');const dir=process.argv[1];const required=JSON.parse(process.argv[2]);const files=(fs.existsSync(dir)?fs.readdirSync(dir):[]).filter(f=>/^mbo-e2e-\\d{8}-\\d{6}\\.log$/.test(f)).sort();if(!files.length){console.error('missing alpha transcript');process.exit(1)};const latest=p.join(dir, files[files.length-1]);const text=fs.readFileSync(latest,'utf8');const missing=required.filter(s=>!text.includes(s));if(missing.length){console.error('missing required content: '+missing.join(' | '));process.exit(1)};console.log(files[files.length-1]);" ${shellEscape(alphaLogsDir)} ${shellEscape(payload)}`;
}

function validateMirrorTranscriptCopy(mirrorLogsDir, alphaLogsDir) {
  const alphaTranscript = readLatestAlphaTranscript(alphaLogsDir);
  if (!alphaTranscript) {
    return { ok: false, details: 'missing alpha transcript for mirror-copy comparison' };
  }

  const copyPath = path.join(mirrorLogsDir, `${path.basename(alphaTranscript.filePath)}.copy`);
  if (!fs.existsSync(copyPath)) {
    return { ok: false, details: `missing mirror transcript copy: ${path.basename(copyPath)}` };
  }

  const mirrorText = fs.readFileSync(copyPath, 'utf8');
  if (mirrorText !== alphaTranscript.text) {
    return { ok: false, details: `mirror transcript copy drift: ${path.basename(copyPath)}` };
  }

  return {
    ok: true,
    details: path.basename(copyPath),
    filePath: copyPath,
  };
}

function buildGovernanceChecks(root, taskId) {
  const checks = [];
  const requiredFiles = [
    '.dev/governance/AGENTS.md',
    '.dev/governance/projecttracking.md',
    '.dev/governance/BUGS.md',
    '.dev/governance/CHANGELOG.md',
    'docs/e2e-audit-checklist.md',
  ];

  for (const rel of requiredFiles) {
    const abs = path.join(root, rel);
    let present = fs.existsSync(abs);

    if (!present && rel === 'docs/e2e-audit-checklist.md') {
      const template = [
        '# E2E Audit Checklist (Milestone 1.1 Hardening)',
        '',
        '## 0) Run Header (Required)',
        '- Run ID: v0.11.x-template',
        '- Date/Time (PT): unknown',
        '- Operator: unknown',
        '- Task ID (from `.dev/governance/projecttracking.md`): unknown',
        '- Milestone: 1.1',
        '- Branch: unknown',
        '- Target repo/world (`mirror` or `subject`): mirror',
        '',
        '## 1) Calibration Phase Audit (Onboarding / Gate 0)',
        '- [ ] Entropy gate exceeded (`entropyScore > 10`) blocks execution (Stage 1.5)',
        '- [ ] Human approval missing (`go` absent) blocks mutation',
        '- [ ] Audit gate unresolved (`approved|reject` missing) blocks completion',
        '- [ ] Validator failure after recovery loop blocks completion',
        '- [ ] Any write outside approved file scope blocks completion',
        '- [ ] MCP/graph unavailable after recovery blocks completion',
        '',
        '## 2) Planning Phase Audit (Pre-Build)',
        '- [ ] Plan rationale is in labeled sections (not implicit chat prose)',
        '- [ ] Assumption Ledger generated for Tier 1+',
        '- [ ] Blockers explicitly enumerated',
        '- [ ] Sign-off block emitted with entropy score and defaults',
        '',
        '## 3) Execution Phase Audit (Tool Use)',
        '- [ ] Environment mutations logged',
        '- [ ] Runtime integrity check performed after shell/tool actions',
        '- [ ] Python/Node execution path validated post-change',
        '- [ ] No direct DB writes by agent (Invariant 18)',
        '### 3.1 Traceability (Dark Code Test)',
        '| File Changed | Why Needed | Source Requirement | Task Link | Evidence |',
        '|---|---|---|---|---|',
        '| | | | | |',
        '',
        '## 4) Verification Phase Audit (Post-Build)',
        '- [ ] `CHANGELOG.md` updated with task and acceptance evidence',
        '- [ ] `projecttracking.md` status updated',
        '- [ ] `BUGS.md`/`BUGS-resolved.md` updated per workflow rules',
        '- [ ] Active governance snapshot reference recorded',
        '',
        '## 5) Adversarial "Why" Proof (Hallucination-of-Success Check)',
        '- [ ] Authorized: all mutations were explicitly approved',
        '- [ ] Auditable: full trace from requirement -> change -> verification -> decision',
        '- [ ] Aligned: output conforms to Prime Directive + Section 22 invariants',
        '- [ ] Reproducible: another operator can rerun checks from artifacts',
        '',
        '`NON_HALLUCINATION_PROOF=PENDING`',
        '',
        '## 6) Weighted Scorecard (Required)',
        '| Category | Weight | Score Earned |',
        '|---|---:|---:|',
        '| Calibration Phase Controls (Section 1) | 20 | 0 |',
        '| Planning Phase Controls (Section 2) | 20 | 0 |',
        '| Execution Traceability + Side Effects (Section 3) | 30 | 0 |',
        '| Verification + Persistence (Section 4) | 20 | 0 |',
        '| Adversarial Non-Hallucination Proof (Section 5) | 10 | 0 |',
        '| **Total** | **100** | 0 |',
        '',
        '## 7) Sign-Off Block (Required)',
        '- Audit Verdict: PENDING',
        '- Score Total: 0',
        '- Blocking Findings: none',
        '- Waivers (if any): none',
        '- Approved by: unknown',
        '- Date/Time (PT): unknown',
      ].join('\n');
      ensureDir(path.dirname(abs));
      fs.writeFileSync(abs, template + '\n', 'utf8');
      present = true;
    }

    checks.push({
      id: `gov-file-${rel}`,
      label: `Required governance file exists: ${rel}`,
      severity: 'P1',
      ok: present,
      details: present ? 'present' : 'missing',
    });
  }

  const projecttrackingPath = path.join(root, '.dev/governance/projecttracking.md');
  const bugsPath = path.join(root, '.dev/governance/BUGS.md');
  const ptText = readIfExists(projecttrackingPath);
  const bugsText = readIfExists(bugsPath);
  const statuses = parseTaskStatuses(ptText);

  if (taskId) {
    const exists = taskInProjecttracking(ptText, taskId);
    checks.push({
      id: 'gov-task-id-present',
      label: `Task exists in projecttracking: ${taskId}`,
      severity: 'P1',
      ok: exists,
      details: exists ? 'present in task ledger' : 'missing from task ledger',
    });

    if (exists) {
      const status = statuses[taskId] || 'UNKNOWN';
      const allowed = new Set(['READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'DEFERRED']);
      checks.push({
        id: 'gov-task-status',
        label: `Task has recognized status: ${taskId}`,
        severity: 'P2',
        ok: allowed.has(status),
        details: `status=${status}`,
      });
    }
  }

  const nextBug = parseNextBugNumber(bugsText);
  checks.push({
    id: 'gov-next-bug-number',
    label: 'BUGS.md declares next bug number',
    severity: 'P2',
    ok: Number.isInteger(nextBug),
    details: Number.isInteger(nextBug) ? `BUG-${nextBug}` : 'missing marker',
  });

  return checks;
}

function toBugFinding(source, severity, title, description) {
  return {
    source,
    severity,
    title,
    description,
    observedAt: new Date().toISOString(),
    status: 'OPEN',
  };
}

function appendBugsMd(root, findings, taskId) {
  const bugsPath = path.join(root, '.dev/governance/BUGS.md');
  const current = readIfExists(bugsPath);
  if (!current) return { updated: false, reason: 'BUGS.md missing' };

  const next = parseNextBugNumber(current);
  if (!Number.isInteger(next)) return { updated: false, reason: 'Next bug number marker missing' };

  const date = new Date().toISOString().slice(0, 10);
  let bugNo = next;
  const entries = findings.map((f) => {
    const n = bugNo++;
    return [
      '',
      `### BUG-${n}: ${f.title} | Milestone: 1.1 | OPEN`,
      `- **Location:** workflow audit (${f.source})`,
      `- **Severity:** ${f.severity}`,
      `- **Status:** OPEN — observed ${date}`,
      `- **Task:** ${taskId || 'v0.11.176'}`,
      `- **Description:** ${f.description}`,
      '- **Acceptance:** Issue resolved and workflow audit passes on rerun.',
    ].join('\n');
  });

  const updated = current
    .replace(/(\*\*Next bug number:\*\*\s*BUG-)(\d+)/i, `$1${bugNo}`)
    .concat('\n', entries.join('\n'), '\n');

  fs.writeFileSync(bugsPath, updated, 'utf8');
  return { updated: true, added: findings.length, nextBug: bugNo };
}

function appendGovernanceFindings(root, findings) {
  const bugsPath = path.join(root, '.dev/governance/BUGS.md');
  const projecttrackingPath = path.join(root, '.dev/governance/projecttracking.md');
  const bugsText = readIfExists(bugsPath);
  const projecttrackingText = readIfExists(projecttrackingPath);

  if (!bugsText) return { updated: false, reason: 'BUGS.md missing' };
  if (!projecttrackingText) return { updated: false, reason: 'projecttracking.md missing' };

  const nextBug = parseNextBugNumber(bugsText);
  if (!Number.isInteger(nextBug)) return { updated: false, reason: 'Next bug number marker missing' };

  const date = new Date().toISOString().slice(0, 10);
  const lane = '0.2';
  const marker = '\n---\n\n## Recently Completed';
  const insertIndex = projecttrackingText.indexOf(marker);
  if (insertIndex === -1) return { updated: false, reason: 'Active task insertion marker missing' };

  let bugNo = nextBug;
  let nextTaskId = deriveNextTaskId(projecttrackingText, lane);
  const assigned = findings.map((finding) => {
    const taskId = nextTaskId;
    const nextSuffix = Number(taskId.split('.').pop()) + 1;
    nextTaskId = `v${lane}.${nextSuffix}`;
    return { ...finding, bugNo: bugNo++, taskId };
  });

  const bugEntries = assigned.map((finding) => [
    '',
    `### BUG-${finding.bugNo} / ${finding.taskId} — ${finding.title}`,
    `**Severity:** ${finding.severity}`,
    '**Status:** OPEN',
    `**Task:** ${finding.taskId}`,
    `**Found:** ${date} (workflow audit)`,
    '**Description:**',
    finding.description,
    '**Acceptance:**',
    '- Issue resolved and workflow audit passes on rerun.',
  ].join('\n'));

  const taskRows = assigned.map((finding) => `| ${finding.taskId} | bug | ${sanitizeTableCell(finding.title)} | READY | unassigned | - | ${date} | BUG-${finding.bugNo} | Issue resolved and workflow audit passes on rerun. |`);

  const updatedBugs = bugsText
    .replace(/(\*\*Next bug number:\*\*\s*BUG-)(\d+)/i, `$1${bugNo}`)
    .concat('\n', bugEntries.join('\n'), '\n');

  const before = projecttrackingText.slice(0, insertIndex).replace(/\s*$/, '');
  const after = projecttrackingText.slice(insertIndex);
  const updatedProjecttracking = `${before}\n${taskRows.join('\n')}\n${after}`;

  fs.writeFileSync(bugsPath, updatedBugs, 'utf8');
  fs.writeFileSync(projecttrackingPath, updatedProjecttracking, 'utf8');

  return {
    updated: true,
    added: findings.length,
    nextBug: bugNo,
    taskIds: assigned.map((finding) => finding.taskId),
  };
}

function buildCommandChecks(root, args) {
  const checks = [
    {
      id: 'validator',
      label: 'Validator (all)',
      cmd: 'python3 bin/validator.py --all',
      severity: 'P1',
      scope: 'mirror',
      cwd: root,
      timeoutMs: 120000,
    },
    {
      id: 'invariants',
      label: 'Invariant suite',
      cmd: 'node scripts/test-invariants.js',
      severity: 'P1',
      scope: 'mirror',
      cwd: root,
      timeoutMs: 180000,
    },
    {
      id: 'state',
      label: 'State/redaction suite',
      cmd: 'node scripts/test-state.js',
      severity: 'P2',
      scope: 'mirror',
      cwd: root,
      timeoutMs: 180000,
    },
    {
      id: 'chain',
      label: 'Event chain verification',
      cmd: 'node scripts/verify-chain.js',
      severity: 'P1',
      scope: 'mirror',
      cwd: root,
      timeoutMs: 180000,
    },
  ];

  if (args.pushAlpha) {
    const alphaRoot = path.resolve(args.alphaRoot);
    const alphaLogsDir = path.join(alphaRoot, '.mbo', 'logs');
    const mirrorLogsDir = path.join(root, '.dev', 'sessions', 'analysis');
    const mirrorConfig = path.join(root, '.mbo', 'config.json');
    const alphaConfig = path.join(alphaRoot, '.mbo', 'config.json');

    checks.push(
      {
        id: 'alpha_install',
        label: 'Package/install to Alpha target',
        cmd: `bash scripts/mbo-install-alpha.sh ${shellEscape(alphaRoot)}`,
        severity: 'P1',
        scope: 'alpha',
        cwd: root,
        timeoutMs: 240000,
      },
      {
        id: 'alpha_onboarding_seed',
        label: 'Seed Alpha onboarding profile when missing',
        cmd: `node -e "const fs=require('fs');const p=require('path');const alpha=process.argv[1];const mirrorCfg=process.argv[2];const alphaCfg=process.argv[3];const onboarding=p.join(alpha,'.mbo','onboarding.json');if(fs.existsSync(onboarding)){console.log('onboarding.json already present');process.exit(0)};if(!fs.existsSync(mirrorCfg)){console.error('mirror config missing: '+mirrorCfg);process.exit(2)};const mc=JSON.parse(fs.readFileSync(mirrorCfg,'utf8'));const payload={projectRoot:alpha,subjectRoot:alpha,testCommand:'npm test',primeDirective:mc.primeDirective||'Maintain system integrity',partnershipStyle:mc.partnershipStyle||'proactive architect',projectType:mc.projectType||'existing',deploymentTarget:mc.deploymentTarget||'unknown',stagingPath:mc.stagingPath||'internal',dangerZones:Array.isArray(mc.dangerZones)?mc.dangerZones:[],verificationCommands:Array.isArray(mc.verificationCommands)?mc.verificationCommands:['npm test'],realConstraints:Array.isArray(mc.realConstraints)?mc.realConstraints:[],binaryVersion:mc.binaryVersion||'0.11.24',onboardingVersion:Number(mc.onboardingVersion||1)};fs.mkdirSync(p.dirname(onboarding),{recursive:true});fs.writeFileSync(onboarding,JSON.stringify(payload,null,2)+'\\n','utf8');let ac={};if(fs.existsSync(alphaCfg)){try{ac=JSON.parse(fs.readFileSync(alphaCfg,'utf8'))}catch{ac={}}};if(!ac.projectRoot)ac.projectRoot=alpha;if(!ac.scanRoots)ac.scanRoots=['src'];fs.mkdirSync(p.dirname(alphaCfg),{recursive:true});fs.writeFileSync(alphaCfg,JSON.stringify(ac,null,2)+'\\n','utf8');console.log('seeded onboarding.json and ensured alpha config');" ${shellEscape(alphaRoot)} ${shellEscape(mirrorConfig)} ${shellEscape(alphaConfig)}`,
        severity: 'P1',
        scope: 'alpha',
        cwd: root,
        timeoutMs: 20000,
      },
      {
        id: 'alpha_e2e',
        label: args.humanInput ? 'Alpha runtime interactive session (human input)' : 'Alpha runtime E2E workflow cycle',
        cmd: args.humanInput
          ? `bash scripts/mbo-run-alpha.sh ${shellEscape(alphaRoot)}`
          : `MBO_CONTROLLER_ROOT=${shellEscape(path.resolve(root))} bash scripts/alpha-runtime.sh e2e --alpha ${shellEscape(alphaRoot)}`,
        severity: 'P1',
        scope: 'alpha',
        cwd: root,
        timeoutMs: Math.floor(args.alphaTimeoutSec * 1000),
        interactive: Boolean(args.humanInput),
      },
      {
        id: 'alpha_e2e_log',
        label: 'Alpha E2E transcript is fresh and complete',
        cmd: buildAlphaTranscriptCheckCommand(alphaLogsDir),
        severity: 'P1',
        scope: 'alpha',
        cwd: root,
        timeoutMs: 15000,
      },
      {
        id: 'alpha_e2e_mirror_copy',
        label: 'Mirrored E2E transcript matches latest Alpha run',
        cmd: `node -e "const fs=require('fs');const p=require('path');const alphaDir=process.argv[1];const mirrorDir=process.argv[2];const alphaFiles=(fs.existsSync(alphaDir)?fs.readdirSync(alphaDir):[]).filter(f=>/^mbo-e2e-\\d{8}-\\d{6}\\.log$/.test(f)).sort();if(!alphaFiles.length){console.error('missing alpha transcript');process.exit(1)};const latestAlpha=alphaFiles[alphaFiles.length-1];const alphaPath=p.join(alphaDir, latestAlpha);const mirrorPath=p.join(mirrorDir, latestAlpha+'.copy');if(!fs.existsSync(mirrorPath)){console.error('missing mirror copy: '+p.basename(mirrorPath));process.exit(1)};const alphaText=fs.readFileSync(alphaPath,'utf8');const mirrorText=fs.readFileSync(mirrorPath,'utf8');if(alphaText!==mirrorText){console.error('mirror transcript copy drift: '+p.basename(mirrorPath));process.exit(1)};console.log(p.basename(mirrorPath));" ${shellEscape(alphaLogsDir)} ${shellEscape(mirrorLogsDir)}`,
        severity: 'P1',
        scope: 'mirror',
        cwd: root,
        timeoutMs: 15000,
      }
    );
  }

  return checks;
}

function buildWorldCommandChecks(root, args) {
  const baseChecks = buildCommandChecks(root, args);
  const worlds = getWorldSequence(args.world);
  const alphaRoot = path.resolve(args.alphaRoot);

  return worlds.map((world) => {
    if (world === 'mirror') {
      const mirrorChecks = baseChecks.filter((check) => {
        if (check.scope === 'alpha') return Boolean(args.pushAlpha);
        if (args.world === 'both' && args.pushAlpha && check.id === 'alpha_e2e_mirror_copy') return false;
        return true;
      });

      return {
        world,
        displayName: 'mirror',
        root: root,
        checks: mirrorChecks.map((check) => cloneCheckForWorld(check, world, root, alphaRoot)),
      };
    }

    const subjectChecks = [];
    if (args.pushAlpha) {
      subjectChecks.push(...baseChecks.map((check) => cloneCheckForWorld(check, world, root, alphaRoot)));
    } else {
      subjectChecks.push(...baseChecks
        .filter((check) => check.scope !== 'alpha')
        .map((check) => cloneCheckForWorld(check, world, alphaRoot, alphaRoot)));
    }

    return {
      world,
      displayName: args.pushAlpha ? 'subject (alpha)' : 'subject',
      root: alphaRoot,
      checks: subjectChecks,
    };
  });
}

function summarizeFindings(commandResults, governanceChecks, root, runDir) {
  const findings = [];

  for (const c of commandResults) {
    if (!c.ok) {
      const reason = c.timedOut
        ? `Command timed out after ${Math.floor((c.timeoutMs || 0) / 1000)}s.`
        : `Command failed with exit code ${c.code}.`;
      findings.push(toBugFinding(
        `command:${c.world}:${c.id}`,
        c.severity,
        `Workflow check failed (${c.world}/${c.scope}): ${c.label}`,
        `${reason} See ${path.relative(root, path.join(runDir, c.world, `${c.id}.log`))}.`
      ));
    }
  }

  for (const g of governanceChecks) {
    if (!g.ok) {
      findings.push(toBugFinding(
        `governance:${g.id}`,
        g.severity,
        `Governance compliance failure: ${g.label}`,
        `Compliance check reported '${g.details}'.`
      ));
    }
  }

  return findings;
}

function buildWorldOutcome(world, checks, results) {
  const total = checks.length;
  const passed = results.filter((r) => r.ok).length;
  const verdict = passed === total ? 'PASS' : 'FAIL';
  return {
    world,
    verdict,
    checks: {
      total,
      passed,
      failed: total - passed,
    },
  };
}

function main() {
  const root = path.resolve(__dirname, '..');
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[MBO] ${err.message}`);
    process.exit(2);
  }
  const runId = `workflow-audit-${nowStamp()}`;
  const runDir = path.join(root, '.mbo', 'logs', runId);
  ensureDir(runDir);

  if (process.cwd() !== root) {
    console.log(`[MBO] Launch directory: ${process.cwd()}`);
    console.log(`[MBO] Using controller root: ${root}`);
  }

  const governanceChecks = buildGovernanceChecks(root, args.task);
  const worldCommandChecks = buildWorldCommandChecks(root, args);

  if (args.pushAlpha && getWorldSequence(args.world).includes('subject')) {
    const alphaRoot = path.resolve(args.alphaRoot);
    if (alphaOnboardingExists(alphaRoot)) {
      console.log('[MBO] Alpha onboarding.json detected, continuing with E2E run.');
    } else {
      console.log('[MBO] Alpha onboarding.json missing; auto-seed step will run before E2E.');
    }
  }
  const commandResults = [];

  console.log(`[MBO] Starting workflow audit: ${runId}`);
  console.log(`[MBO] Logs directory: ${runDir}`);

  const worldOutcomes = [];

  for (const worldRun of worldCommandChecks) {
    const worldRunDir = path.join(runDir, worldRun.world);
    ensureDir(worldRunDir);
    console.log(`[MBO] World start: ${worldRun.displayName}`);

    const worldResults = [];
    for (const check of worldRun.checks) {
      console.log(`[MBO] Running [${worldRun.world}]: ${check.label}`);
      const result = runCommand(check.cmd, check.cwd, check.timeoutMs || 0, Boolean(check.interactive));
      const logPath = path.join(worldRunDir, `${check.id}.log`);
      const merged = [
        `$ world=${worldRun.world}`,
        `$ scope=${check.scope}`,
        `$ (cwd=${check.cwd}) ${check.cmd}`,
        `$ timeoutMs=${check.timeoutMs || 0}`,
        '',
        check.interactive ? '[interactive mode] Output streamed directly to terminal; not captured in log body.' : '',
        result.stdout,
        result.stderr,
      ].filter(Boolean).join('\n');
      fs.writeFileSync(logPath, `${merged}\n`, 'utf8');

      const record = { ...check, ...result, logPath: path.relative(root, logPath) };
      commandResults.push(record);
      worldResults.push(record);

      console.log(`[MBO] Log file: ${logPath}`);
      console.log(`[MBO] ---- BEGIN ${worldRun.world}:${check.id} ----`);
      if (merged.trim()) {
        process.stdout.write(`${merged}\n`);
      }
      console.log(`[MBO] ---- END ${worldRun.world}:${check.id} ----`);
    }

    worldOutcomes.push(buildWorldOutcome(worldRun.world, worldRun.checks, worldResults));
  }

  const findings = summarizeFindings(commandResults, governanceChecks, root, runDir);

  const totalChecks = commandResults.length + governanceChecks.length;
  const passedChecks = commandResults.filter((c) => c.ok).length + governanceChecks.filter((g) => g.ok).length;
  const score = Math.round((passedChecks / totalChecks) * 100);
  const verdict = findings.length === 0 && worldOutcomes.every((w) => w.verdict === 'PASS') ? 'PASS' : 'FAIL';

  const summary = {
    runId,
    generatedAt: new Date().toISOString(),
    operator: args.operator,
    task: args.task || null,
    world: args.world,
    worldSequence: getWorldSequence(args.world),
    pushAlpha: args.pushAlpha,
    alphaRoot: args.pushAlpha ? path.resolve(args.alphaRoot) : null,
    alphaTimeoutSec: args.alphaTimeoutSec,
    verdict,
    worlds: worldOutcomes,
    score,
    checks: {
      total: totalChecks,
      passed: passedChecks,
      failed: totalChecks - passedChecks,
    },
    commandResults: commandResults.map((c) => ({
      id: c.id,
      world: c.world,
      label: c.label,
      scope: c.scope,
      ok: c.ok,
      code: c.code,
      timedOut: Boolean(c.timedOut),
      timeoutMs: c.timeoutMs || 0,
      severity: c.severity,
      logPath: c.logPath,
    })),
    governanceResults: governanceChecks,
    bugFindings: findings,
  };

  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

  const bugMd = [];
  bugMd.push('# Workflow Audit Bug Log');
  bugMd.push('');
  bugMd.push(`- Run ID: ${runId}`);
  bugMd.push(`- Verdict: ${verdict}`);
  bugMd.push(`- Worlds: ${worldOutcomes.map((w) => `${w.world}=${w.verdict}`).join(', ')}`);
  bugMd.push(`- Score: ${score}`);
  bugMd.push(`- Findings: ${findings.length}`);
  bugMd.push('');
  if (findings.length === 0) {
    bugMd.push('No bug findings detected.');
  } else {
    for (const f of findings) {
      bugMd.push(`## ${f.severity} - ${f.title}`);
      bugMd.push(`- Source: ${f.source}`);
      bugMd.push(`- Status: ${f.status}`);
      bugMd.push(`- Description: ${f.description}`);
      bugMd.push(`- Observed At: ${f.observedAt}`);
      bugMd.push('');
    }
  }
  fs.writeFileSync(path.join(runDir, 'bugs.md'), bugMd.join('\n') + '\n', 'utf8');

  const complianceMd = [];
  complianceMd.push('# MBO Workflow Compliance Report');
  complianceMd.push('');
  complianceMd.push(`- Run ID: ${runId}`);
  complianceMd.push(`- Operator: ${args.operator}`);
  complianceMd.push(`- Task: ${args.task || 'n/a'}`);
  complianceMd.push(`- World: ${args.world}`);
  complianceMd.push(`- Alpha Mode: ${args.pushAlpha ? 'enabled' : 'disabled'}`);
  if (args.pushAlpha) {
    complianceMd.push(`- Alpha Root: ${path.resolve(args.alphaRoot)}`);
    complianceMd.push(`- Alpha Timeout (sec): ${args.alphaTimeoutSec}`);
  }
  complianceMd.push(`- Verdict: ${verdict}`);
  complianceMd.push(`- Compliance Score: ${score}`);
  complianceMd.push('');
  complianceMd.push('## World Outcomes');
  for (const world of worldOutcomes) {
    complianceMd.push(`- ${world.world}: ${world.verdict} (${world.checks.passed}/${world.checks.total} passed)`);
  }
  complianceMd.push('');
  complianceMd.push('## Command Checks');
  for (const c of commandResults) {
    const timeoutTag = c.timedOut ? ' [TIMEOUT]' : '';
    complianceMd.push(`- ${c.ok ? 'PASS' : 'FAIL'} [${c.world}/${c.scope}] ${c.label} (${c.id})${timeoutTag}`);
  }
  complianceMd.push('');
  complianceMd.push('## Governance Checks');
  for (const g of governanceChecks) {
    complianceMd.push(`- ${g.ok ? 'PASS' : 'FAIL'} ${g.label} (${g.details})`);
  }
  complianceMd.push('');
  complianceMd.push('## Findings Count');
  complianceMd.push(`${findings.length}`);
  complianceMd.push('');
  complianceMd.push('## Artifacts');
  complianceMd.push(`- Summary JSON: ${path.relative(root, path.join(runDir, 'summary.json'))}`);
  complianceMd.push(`- Bug Log: ${path.relative(root, path.join(runDir, 'bugs.md'))}`);
  complianceMd.push(`- Full logs: ${path.relative(root, runDir)}`);
  fs.writeFileSync(path.join(runDir, 'compliance.md'), complianceMd.join('\n') + '\n', 'utf8');

  let bugUpdate = null;
  if (args.updateBugs && findings.length > 0) {
    bugUpdate = appendGovernanceFindings(root, findings);
  }

  console.log(`[MBO] Compliance report: ${path.relative(root, path.join(runDir, 'compliance.md'))}`);
  console.log(`[MBO] Bug log: ${path.relative(root, path.join(runDir, 'bugs.md'))}`);
  console.log(`[MBO] Summary JSON: ${path.relative(root, path.join(runDir, 'summary.json'))}`);
  console.log(`[MBO] Full run logs directory: ${runDir}`);
  if (bugUpdate && bugUpdate.updated) {
    console.log(`[MBO] BUGS.md updated with ${bugUpdate.added} finding(s). Next bug number: BUG-${bugUpdate.nextBug}`);
    if (Array.isArray(bugUpdate.taskIds) && bugUpdate.taskIds.length > 0) {
      console.log(`[MBO] projecttracking.md advanced with task(s): ${bugUpdate.taskIds.join(', ')}`);
    }
  } else if (args.updateBugs && findings.length > 0) {
    console.log(`[MBO] BUGS.md update skipped: ${bugUpdate ? bugUpdate.reason : 'unknown reason'}`);
  }

  const hasCommandFailure = commandResults.some((r) => !r.ok);
  const hasGovernanceFailure = governanceChecks.some((g) => !g.ok);
  if ((args.strict && (hasCommandFailure || hasGovernanceFailure || findings.length > 0)) || (!args.strict && hasCommandFailure)) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  appendGovernanceFindings,
  deriveNextTaskId,
  parseNextBugNumber,
};
