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
    alphaRoot: process.env.MBO_ALPHA_ROOT || '/Users/johnserious/MBO_Alpha',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') args.task = argv[++i] || '';
    else if (a === '--world') args.world = argv[++i] || 'mirror';
    else if (a === '--operator') args.operator = argv[++i] || args.operator;
    else if (a === '--alpha-root') args.alphaRoot = argv[++i] || args.alphaRoot;
    else if (a === '--strict') args.strict = true;
    else if (a === '--update-bugs') args.updateBugs = true;
    else if (a === '--push-alpha') args.pushAlpha = true;
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/mbo-workflow-audit.js [--task <task-id>] [--world mirror|subject] [--operator <name>] [--strict] [--update-bugs] [--push-alpha] [--alpha-root <path>]');
      process.exit(0);
    }
  }

  return args;
}

function runCommand(cmd, cwd) {
  try {
    const stdout = cp.execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, code: 0, stdout: stdout || '', stderr: '' };
  } catch (err) {
    return {
      ok: false,
      code: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : (err.message || ''),
    };
  }
}

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseNextBugNumber(bugsText) {
  const m = bugsText.match(/\*\*Next bug number:\*\*\s*BUG-(\d+)/i);
  return m ? Number(m[1]) : null;
}

function parseActiveTaskStatuses(projecttrackingText) {
  const statuses = {};
  let inActive = false;
  for (const line of projecttrackingText.split('\n')) {
    if (line.trim() === '## Active Tasks') {
      inActive = true;
      continue;
    }
    if (inActive && line.startsWith('## ')) break;
    if (!inActive || !line.startsWith('|')) continue;
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
    checks.push({
      id: `gov-file-${rel}`,
      label: `Required governance file exists: ${rel}`,
      severity: 'P1',
      ok: fs.existsSync(abs),
      details: fs.existsSync(abs) ? 'present' : 'missing',
    });
  }

  const projecttrackingPath = path.join(root, '.dev/governance/projecttracking.md');
  const bugsPath = path.join(root, '.dev/governance/BUGS.md');
  const ptText = readIfExists(projecttrackingPath);
  const bugsText = readIfExists(bugsPath);
  const statuses = parseActiveTaskStatuses(ptText);

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

function buildCommandChecks(root, args) {
  const checks = [
    {
      id: 'validator',
      label: 'Validator (all)',
      cmd: 'python3 bin/validator.py --all',
      severity: 'P1',
      scope: 'mirror',
      cwd: root,
    },
    {
      id: 'invariants',
      label: 'Invariant suite',
      cmd: 'node scripts/test-invariants.js',
      severity: 'P1',
      scope: 'mirror',
      cwd: root,
    },
    {
      id: 'state',
      label: 'State/redaction suite',
      cmd: 'node scripts/test-state.js',
      severity: 'P2',
      scope: 'mirror',
      cwd: root,
    },
    {
      id: 'chain',
      label: 'Event chain verification',
      cmd: 'node scripts/verify-chain.js',
      severity: 'P1',
      scope: 'mirror',
      cwd: root,
    },
  ];

  if (args.pushAlpha) {
    const alphaRoot = path.resolve(args.alphaRoot);
    checks.push(
      {
        id: 'alpha_install',
        label: 'Package/install to Alpha target',
        cmd: `bash scripts/mbo-install-alpha.sh ${shellEscape(alphaRoot)}`,
        severity: 'P1',
        scope: 'alpha',
        cwd: root,
      },
      {
        id: 'alpha_validator',
        label: 'Alpha validator (all)',
        cmd: 'python3 bin/validator.py --all',
        severity: 'P1',
        scope: 'alpha',
        cwd: alphaRoot,
      },
      {
        id: 'alpha_invariants',
        label: 'Alpha invariant suite',
        cmd: 'node scripts/test-invariants.js',
        severity: 'P1',
        scope: 'alpha',
        cwd: alphaRoot,
      },
      {
        id: 'alpha_chain',
        label: 'Alpha event chain verification',
        cmd: 'node scripts/verify-chain.js',
        severity: 'P1',
        scope: 'alpha',
        cwd: alphaRoot,
      }
    );
  }

  return checks;
}

function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const runId = `workflow-audit-${nowStamp()}`;
  const runDir = path.join(root, '.mbo', 'logs', runId);
  ensureDir(runDir);

  const governanceChecks = buildGovernanceChecks(root, args.task);
  const commandChecks = buildCommandChecks(root, args);
  const commandResults = [];

  console.log(`[MBO] Starting workflow audit: ${runId}`);
  console.log(`[MBO] Logs directory: ${runDir}`);

  for (const check of commandChecks) {
    console.log(`[MBO] Running: ${check.label}`);
    const result = runCommand(check.cmd, check.cwd);
    commandResults.push({ ...check, ...result });

    const outPath = path.join(runDir, `${check.id}.log`);
    const merged = [`$ (cwd=${check.cwd}) ${check.cmd}`, '', result.stdout, result.stderr].filter(Boolean).join('\n');
    fs.writeFileSync(outPath, `${merged}\n`, 'utf8');
  }

  const findings = [];

  for (const c of commandResults) {
    if (!c.ok) {
      findings.push(toBugFinding(
        `command:${c.id}`,
        c.severity,
        `Workflow check failed (${c.scope}): ${c.label}`,
        `Command failed with exit code ${c.code}. See ${path.relative(root, path.join(runDir, `${c.id}.log`))}.`
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

  const totalChecks = commandResults.length + governanceChecks.length;
  const passedChecks = commandResults.filter((c) => c.ok).length + governanceChecks.filter((g) => g.ok).length;
  const score = Math.round((passedChecks / totalChecks) * 100);
  const verdict = findings.length === 0 ? 'PASS' : 'FAIL';

  const summary = {
    runId,
    generatedAt: new Date().toISOString(),
    operator: args.operator,
    task: args.task || null,
    world: args.world,
    pushAlpha: args.pushAlpha,
    alphaRoot: args.pushAlpha ? path.resolve(args.alphaRoot) : null,
    verdict,
    score,
    checks: {
      total: totalChecks,
      passed: passedChecks,
      failed: totalChecks - passedChecks,
    },
    commandResults: commandResults.map((c) => ({
      id: c.id,
      label: c.label,
      scope: c.scope,
      ok: c.ok,
      code: c.code,
      severity: c.severity,
      logPath: path.relative(root, path.join(runDir, `${c.id}.log`)),
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
  }
  complianceMd.push(`- Verdict: ${verdict}`);
  complianceMd.push(`- Compliance Score: ${score}`);
  complianceMd.push('');
  complianceMd.push('## Command Checks');
  for (const c of commandResults) {
    complianceMd.push(`- ${c.ok ? 'PASS' : 'FAIL'} [${c.scope}] ${c.label} (${c.id})`);
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
    bugUpdate = appendBugsMd(root, findings, args.task);
  }

  console.log(`[MBO] Compliance report: ${path.relative(root, path.join(runDir, 'compliance.md'))}`);
  console.log(`[MBO] Bug log: ${path.relative(root, path.join(runDir, 'bugs.md'))}`);
  if (bugUpdate && bugUpdate.updated) {
    console.log(`[MBO] BUGS.md updated with ${bugUpdate.added} finding(s). Next bug number: BUG-${bugUpdate.nextBug}`);
  } else if (args.updateBugs && findings.length > 0) {
    console.log(`[MBO] BUGS.md update skipped: ${bugUpdate ? bugUpdate.reason : 'unknown reason'}`);
  }

  if ((args.strict && findings.length > 0) || commandResults.some((r) => !r.ok)) {
    process.exit(1);
  }
}

main();
