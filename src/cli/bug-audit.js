'use strict';

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

function readText(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseHeaderValue(text, label) {
  const match = String(text || '').match(new RegExp(`^\\*\\*${escapeRegex(label)}:\\*\\*\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : '';
}

function countTaskRows(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|[-\s|]+\|$/.test(line) && !/Task ID.*Type.*Title/i.test(line))
    .length;
}

function isBootstrapGovernance(text, nextTask, version) {
  return (
    version === '0.1.00'
    && nextTask === 'v0.1.01'
    && /Bootstrap governance ledger/i.test(text)
    && countTaskRows(text) <= 1
  );
}

function chooseGovernanceDir(projectRoot) {
  const candidates = [
    path.join(projectRoot, '.mbo', 'governance'),
    path.join(projectRoot, '.dev', 'governance'),
  ].map((governanceDir) => {
    const projecttrackingPath = path.join(governanceDir, 'projecttracking.md');
    const text = readText(projecttrackingPath);
    if (!text) return null;
    const nextTask = parseHeaderValue(text, 'Next Task');
    const version = parseHeaderValue(text, 'Current Version');
    return {
      governanceDir,
      projecttrackingPath,
      text,
      nextTask,
      version,
      bootstrap: isBootstrapGovernance(text, nextTask, version),
    };
  }).filter(Boolean);

  if (candidates.length === 2) {
    if (candidates[0].bootstrap && !candidates[1].bootstrap) return candidates[1];
    if (candidates[1].bootstrap && !candidates[0].bootstrap) return candidates[0];
  }
  if (candidates.length > 0) return candidates[0];
  return {
    governanceDir: path.join(projectRoot, '.dev', 'governance'),
    projecttrackingPath: path.join(projectRoot, '.dev', 'governance', 'projecttracking.md'),
    text: '',
    nextTask: '',
    version: '',
    bootstrap: false,
  };
}

function parseProjecttracking(projecttrackingText) {
  const rows = [];
  const activeCompleted = [];
  let section = null;

  for (const rawLine of String(projecttrackingText || '').split('\n')) {
    const line = rawLine.trim();
    if (/^##\s+Active Tasks/i.test(line)) {
      section = 'active';
      continue;
    }
    if (/^##\s+Recently/i.test(line)) {
      section = 'recent';
      continue;
    }
    if (/^##\s+/i.test(line)) {
      section = null;
      continue;
    }
    if (!section || !line.startsWith('|')) continue;
    if (/^\|[-\s|]+\|$/.test(line) || /Task ID.*Type.*Title/i.test(line)) continue;

    const cols = rawLine.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cols.length < 10) continue;
    const task = {
      id: cols[0],
      type: cols[1],
      title: cols[2],
      status: cols[3],
      owner: cols[4],
      branch: cols[5],
      updated: cols[6],
      links: cols[7],
      backupRef: cols[8],
      acceptance: cols[9],
      section,
    };
    rows.push(task);
    if (section === 'active' && /^(COMPLETED|DONE|FIXED|CLOSED|RESOLVED)\b/i.test(task.status)) {
      activeCompleted.push(task.id);
    }
  }

  return { rows, activeCompleted };
}

function parseLoggedBugNumbers(text) {
  const matches = [...String(text || '').matchAll(/^###\s+BUG-(\d+)\b/gm)].map((match) => Number(match[1]));
  return matches.filter((value) => Number.isFinite(value));
}

function walk(root, visit, ignore = new Set(['.git', 'node_modules', '.mbo', '.dev', 'dist', 'build', 'coverage'])) {
  if (!fs.existsSync(root)) return;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visit, ignore);
      continue;
    }
    if (entry.isFile()) visit(fullPath);
  }
}

function collectJsFiles(projectRoot) {
  const files = [];
  ['bin', 'src', 'scripts', 'tests'].forEach((dir) => {
    walk(path.join(projectRoot, dir), (filePath) => {
      if (!/\.(c?js|mjs)$/.test(filePath)) return;
      if (filePath.includes(`${path.sep}scripts${path.sep}scratch${path.sep}`)) return;
      files.push(filePath);
    });
  });
  return files.sort();
}

function runCheck(label, fn) {
  try {
    return fn();
  } catch (error) {
    return {
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      ok: false,
      details: error && error.message ? error.message : String(error),
    };
  }
}

function renderBugsReport(result) {
  const lines = [
    '# bugs.md',
    '## Deterministic Bug Audit',
    '',
    `- Generated: ${result.generatedAt}`,
    `- Project Root: ${result.projectRoot}`,
    `- Governance Dir: ${result.governanceDir}`,
    `- Findings: ${result.findings.length}`,
    `- Checks: ${result.checks.length}`,
    '',
  ];

  if (result.findings.length === 0) {
    lines.push('No findings. The deterministic audit checks passed.');
    return lines.join('\n') + '\n';
  }

  result.findings.forEach((finding, index) => {
    lines.push(`### ${index + 1}. [${finding.severity}] ${finding.title}`);
    lines.push(`- Check: ${finding.check}`);
    lines.push(`- Evidence: ${finding.details}`);
    lines.push(`- Recommended Fix: ${finding.fix}`);
    lines.push('');
  });

  return lines.join('\n') + '\n';
}

function renderResolvedReport(result) {
  const lines = [
    '# bugsresolved.md',
    '## Deterministic Bug Audit — Passing Checks',
    '',
    `- Generated: ${result.generatedAt}`,
    `- Passed Checks: ${result.checks.filter((check) => check.ok).length}/${result.checks.length}`,
    '',
  ];

  const passed = result.checks.filter((check) => check.ok);
  if (passed.length === 0) {
    lines.push('No checks passed.');
  } else {
    passed.forEach((check) => {
      lines.push(`- ${check.label}: ${check.details}`);
    });
  }

  return lines.join('\n') + '\n';
}

function runBugAudit({ projectRoot = process.env.MBO_PROJECT_ROOT || process.cwd() } = {}) {
  const root = path.resolve(projectRoot);
  const stamp = nowStamp();
  const runDir = path.join(root, '.mbo', 'logs', `bug-audit-${stamp}`);
  ensureDir(runDir);

  const governance = chooseGovernanceDir(root);
  const projecttrackingText = readText(governance.projecttrackingPath);
  const bugsText = readText(path.join(governance.governanceDir, 'BUGS.md'));
  const changelogText = readText(path.join(root, 'CHANGELOG.md')) || readText(path.join(governance.governanceDir, 'CHANGELOG.md'));
  const pkgVersion = (() => {
    try {
      const pkg = JSON.parse(readText(path.join(root, 'package.json')) || '{}');
      return String(pkg.version || '');
    } catch {
      return '';
    }
  })();
  const changelogHead = (() => {
    const match = changelogText.match(/^##\s+\[([^\]]+)\]/m);
    return match ? match[1].trim() : '';
  })();

  const ledger = parseProjecttracking(projecttrackingText);
  const taskIds = ledger.rows.map((row) => row.id).filter(Boolean);
  const duplicateTaskIds = [...new Set(taskIds.filter((id, index) => taskIds.indexOf(id) !== index))];
  const nextTask = parseHeaderValue(projecttrackingText, 'Next Task');
  const highestBug = parseLoggedBugNumbers(bugsText).reduce((max, value) => Math.max(max, value), 0);
  const declaredNextBug = Number((bugsText.match(/\*\*Next bug number:\*\*\s*BUG-(\d+)/i) || [])[1] || 0);
  const jsFiles = collectJsFiles(root);

  const checks = [
    runCheck('Projecttracking exists', () => ({
      id: 'projecttracking-exists',
      label: 'Projecttracking exists',
      ok: Boolean(projecttrackingText),
      details: projecttrackingText ? governance.projecttrackingPath : 'projecttracking.md missing',
    })),
    runCheck('Version sync', () => ({
      id: 'version-sync',
      label: 'Version sync',
      ok: Boolean(pkgVersion) && Boolean(changelogHead) && pkgVersion === changelogHead,
      details: `package.json=${pkgVersion || 'missing'} ; changelog=${changelogHead || 'missing'}`,
    })),
    runCheck('Next Task header', () => ({
      id: 'next-task-header',
      label: 'Next Task header',
      ok: Boolean(nextTask) && taskIds.includes(nextTask),
      details: nextTask ? `header=${nextTask}` : 'Next Task header missing',
    })),
    runCheck('Active tasks do not contain completed rows', () => ({
      id: 'active-completed-status',
      label: 'Active tasks do not contain completed rows',
      ok: ledger.activeCompleted.length === 0,
      details: ledger.activeCompleted.length === 0 ? 'active section clean' : `completed rows under active: ${ledger.activeCompleted.join(', ')}`,
    })),
    runCheck('Task IDs are unique', () => ({
      id: 'task-id-uniqueness',
      label: 'Task IDs are unique',
      ok: duplicateTaskIds.length === 0,
      details: duplicateTaskIds.length === 0 ? `${taskIds.length} task rows scanned` : `duplicates: ${duplicateTaskIds.join(', ')}`,
    })),
    runCheck('BUGS next number advances', () => ({
      id: 'bug-number-advance',
      label: 'BUGS next number advances',
      ok: declaredNextBug > highestBug,
      details: `highest BUG=${highestBug || 'none'} ; declared next=${declaredNextBug || 'missing'}`,
    })),
    runCheck('JavaScript syntax', () => {
      const failures = [];
      jsFiles.forEach((filePath) => {
        const res = cp.spawnSync(process.execPath, ['--check', filePath], { cwd: root, encoding: 'utf8' });
        if (res.status !== 0) {
          failures.push(`${path.relative(root, filePath)} :: ${(res.stderr || res.stdout || '').trim().split('\n')[0]}`);
        }
      });
      return {
        id: 'javascript-syntax',
        label: 'JavaScript syntax',
        ok: failures.length === 0,
        details: failures.length === 0 ? `${jsFiles.length} files passed node --check` : failures.join(' | '),
      };
    }),
    runCheck('TUI TypeScript compile', () => {
      const tsconfigPath = path.join(root, 'tsconfig.tui.json');
      if (!fs.existsSync(tsconfigPath)) {
        return {
          id: 'tui-typescript-compile',
          label: 'TUI TypeScript compile',
          ok: true,
          details: 'tsconfig.tui.json not present; skipped',
        };
      }
      const tscBin = path.join(root, 'node_modules', '.bin', 'tsc');
      if (!fs.existsSync(tscBin)) {
        return {
          id: 'tui-typescript-compile',
          label: 'TUI TypeScript compile',
          ok: true,
          details: 'typescript compiler unavailable locally; skipped',
        };
      }
      const res = cp.spawnSync(tscBin, ['-p', tsconfigPath, '--noEmit'], { cwd: root, encoding: 'utf8' });
      return {
        id: 'tui-typescript-compile',
        label: 'TUI TypeScript compile',
        ok: res.status === 0,
        details: res.status === 0 ? 'tsconfig.tui.json passed' : (res.stderr || res.stdout || 'tsc failed').trim().split('\n').slice(0, 3).join(' | '),
      };
    }),
  ];

  const findings = checks
    .filter((check) => !check.ok)
    .map((check) => ({
      check: check.label,
      severity: /syntax|compile/i.test(check.label) ? 'P1' : 'P2',
      title: check.label,
      details: check.details,
      fix: (() => {
        if (check.id === 'version-sync') return 'Align CHANGELOG head with package.json or revert the accidental version drift.';
        if (check.id === 'next-task-header') return 'Point the Next Task header at a real task row in the selected governance ledger.';
        if (check.id === 'active-completed-status') return 'Move completed rows out of Active Tasks or normalize the reader to ignore them.';
        if (check.id === 'task-id-uniqueness') return 'Renumber or deduplicate the repeated task rows so task creation cannot reuse consumed ids.';
        if (check.id === 'bug-number-advance') return 'Advance BUGS.md Next bug number so new findings do not collide with historical ids.';
        if (check.id === 'javascript-syntax') return 'Fix the reported JavaScript syntax errors before trusting runtime behavior.';
        if (check.id === 'tui-typescript-compile') return 'Fix the reported TypeScript build errors in the TUI surface.';
        return 'Inspect the reported evidence and correct the failing contract.';
      })(),
    }));

  const result = {
    generatedAt: new Date().toISOString(),
    projectRoot: root,
    governanceDir: governance.governanceDir,
    runDir,
    checks,
    findings,
    summaryLine: findings.length === 0
      ? `No findings across ${checks.length} deterministic checks.`
      : `${findings.length} finding(s) across ${checks.length} deterministic checks.`,
  };

  const bugsReportPath = path.join(runDir, 'bugs.md');
  const resolvedReportPath = path.join(runDir, 'bugsresolved.md');
  fs.writeFileSync(bugsReportPath, renderBugsReport(result), 'utf8');
  fs.writeFileSync(resolvedReportPath, renderResolvedReport(result), 'utf8');
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(result, null, 2), 'utf8');

  return {
    ...result,
    bugsReportPath,
    resolvedReportPath,
  };
}

if (require.main === module) {
  const result = runBugAudit({ projectRoot: process.argv[2] || process.cwd() });
  process.stdout.write(`${result.summaryLine}\n`);
  process.stdout.write(`bugs.md: ${result.bugsReportPath}\n`);
  process.stdout.write(`bugsresolved.md: ${result.resolvedReportPath}\n`);
  process.exit(result.findings.length === 0 ? 0 : 1);
}

module.exports = { runBugAudit };
