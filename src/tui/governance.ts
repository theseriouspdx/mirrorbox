import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

export interface TaskRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  owner: string;
  branch: string;
  updated: string;
  links: string;
  backupRef: string;
  acceptance: string;
  description?: string;
  bugAcceptance?: string;
  specExcerpt?: string;
  proposedFiles?: string[];
}

export interface GovernanceDoc {
  key: GovernanceDocKey;
  title: string;
  path: string;
  lines: string[];
}

export interface TaskDraftInput {
  lane: string;
  title: string;
  acceptance: string;
  owner?: string;
}

export interface TaskActivationInput {
  context?: string;
  additionalFiles?: string[];
}

export interface GovernanceSummary {
  governanceDir: string;
  projecttrackingPath: string;
  currentMilestone: string;
  currentVersion: string;
  nextTask: string;
  taskRowCount: number;
  bootstrap: boolean;
}

export type GovernanceDocKey = 'projecttracking' | 'bugs' | 'bugs-resolved' | 'changelog';

const GOVERNANCE_FILENAMES: Array<{ key: GovernanceDocKey; title: string; filename: string; scope: 'governance' | 'root' }> = [
  { key: 'projecttracking', title: 'projecttracking.md', filename: 'projecttracking.md', scope: 'governance' },
  { key: 'bugs', title: 'BUGS.md', filename: 'BUGS.md', scope: 'governance' },
  { key: 'bugs-resolved', title: 'BUGS-resolved.md', filename: 'BUGS-resolved.md', scope: 'governance' },
  { key: 'changelog', title: 'CHANGELOG.md', filename: 'CHANGELOG.md', scope: 'root' },
];

function abs(projectRoot: string, relPath: string): string {
  return path.join(projectRoot, relPath);
}

function parseHeaderValue(text: string, label: string): string {
  const escaped = escapeRegex(label);
  const match = text.match(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : '';
}

function countTaskRows(text: string): number {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|[-\s|]+\|$/.test(line) && !/Task ID.*Type.*Title/i.test(line))
    .length;
}

function isBootstrapGovernance(text: string, currentVersion: string, nextTask: string, taskRowCount: number): boolean {
  if (!text) return false;
  return (
    currentVersion === '0.1.00'
    && nextTask === 'v0.1.01'
    && /Bootstrap governance ledger/i.test(text)
    && taskRowCount <= 1
  );
}

function summarizeGovernanceDir(governanceDir: string): GovernanceSummary | null {
  const projecttrackingPath = path.join(governanceDir, 'projecttracking.md');
  const text = readText(projecttrackingPath);
  if (!text) return null;

  const summary: GovernanceSummary = {
    governanceDir,
    projecttrackingPath,
    currentMilestone: parseHeaderValue(text, 'Current Milestone'),
    currentVersion: parseHeaderValue(text, 'Current Version'),
    nextTask: parseHeaderValue(text, 'Next Task'),
    taskRowCount: countTaskRows(text),
    bootstrap: false,
  };
  summary.bootstrap = isBootstrapGovernance(text, summary.currentVersion, summary.nextTask, summary.taskRowCount);
  return summary;
}

function isCompletedStatus(status: string): boolean {
  return /^(COMPLETED|DONE|FIXED|CLOSED|RESOLVED)\b/i.test(String(status || '').trim());
}

/**
 * Returns the governance directory for a given project root.
 * Runtime projects keep governance under .mbo/governance/.
 * MBO's own dev tracking lives under .dev/governance/.
 * Falls back to .dev/governance if neither exists (first-run case).
 */
export function findGovernanceDir(projectRoot: string): string {
  const mboDir = path.join(projectRoot, '.mbo', 'governance');
  const devDir = path.join(projectRoot, '.dev', 'governance');
  const mboSummary = summarizeGovernanceDir(mboDir);
  const devSummary = summarizeGovernanceDir(devDir);

  if (mboSummary && devSummary) {
    if (mboSummary.bootstrap && !devSummary.bootstrap) return devDir;
    if (devSummary.bootstrap && !mboSummary.bootstrap) return mboDir;
    return mboDir;
  }
  if (mboSummary) return mboDir;
  if (devSummary) return devDir;
  // Default to .mbo/governance for runtime projects (will be created on first write)
  if (fs.existsSync(path.join(projectRoot, '.mbo'))) return mboDir;
  return devDir;
}

export function readGovernanceSummary(projectRoot: string): GovernanceSummary {
  const governanceDir = findGovernanceDir(projectRoot);
  const summary = summarizeGovernanceDir(governanceDir);
  if (summary) return summary;
  return {
    governanceDir,
    projecttrackingPath: path.join(governanceDir, 'projecttracking.md'),
    currentMilestone: '',
    currentVersion: '',
    nextTask: '',
    taskRowCount: 0,
    bootstrap: false,
  };
}

function readText(filePath: string): string {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map((cell: string) => cell.trim());
}

function normalizeTaskColumns(cols: string[]): string[] | null {
  if (cols.length >= 10) return cols;
  // Legacy task ledgers omitted the backup-ref column and stored 9 fields.
  if (cols.length === 9) return [...cols.slice(0, 8), '-', cols[8]];
  return null;
}

function findBugSection(text: string, bugId: string): string {
  if (!text || !bugId) return '';
  const escaped = escapeRegex(bugId);
  const match = text.match(new RegExp(`###\\s+${escaped}(?:\\s*/\\s*v[^\\n—:-]+)?(?:\\s*[—:-][^\\n]*)?[\\s\\S]*?(?=\\n###\\s+BUG-|$)`, 'i'));
  return match ? match[0].trim() : '';
}

function extractField(section: string, label: string): string {
  if (!section) return '';
  const escaped = escapeRegex(label);
  const match = section.match(new RegExp(`(?:^|\\n)-?\\s*\\*\\*${escaped}:\\*\\*\\s*([\\s\\S]*?)(?=\\n-?\\s*\\*\\*|\\n### |$)`, 'i'));
  return match ? match[1].trim() : '';
}

function extractSpecExcerpt(projectRoot: string, task: TaskRecord): { excerpt: string; files: string[] } {
  const specPath = abs(projectRoot, '.dev/spec/SPEC.md');
  const specText = readText(specPath);
  if (!specText) return { excerpt: '', files: [] };

  const escapedId = escapeRegex(task.id);
  const direct = specText.match(new RegExp(`####\\s+[^\\n]*${escapedId}[^\\n]*\\n([\\s\\S]*?)(?=\\n#### |\\n### |$)`));
  const excerpt = direct ? direct[0].trim() : '';
  const fileMatches = [...(excerpt || '').matchAll(/([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  return { excerpt, files: [...new Set(fileMatches)] };
}

function uniqueLines(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function extractSpecBullets(specExcerpt: string): string[] {
  if (!specExcerpt) return [];
  return specExcerpt
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim());
}

export function summarizeTaskAssumptions(task: TaskRecord): string[] {
  const specBullets = extractSpecBullets(task.specExcerpt || '');
  const fallback = task.description ? [task.description] : [];
  const assumptions = uniqueLines([...specBullets, ...fallback]);
  return assumptions.length > 0 ? assumptions : ['No explicit assumptions recorded beyond the linked governance rows.'];
}

export function summarizeTaskAcceptance(task: TaskRecord): string[] {
  const acceptance = uniqueLines([task.acceptance || '', task.bugAcceptance || '']);
  return acceptance.length > 0 ? acceptance : ['No explicit acceptance criteria recorded.'];
}

export function buildTaskActivationPrompt(task: TaskRecord, input: TaskActivationInput = {}): string {
  const assumptions = summarizeTaskAssumptions(task);
  const acceptance = summarizeTaskAcceptance(task);
  const proposedFiles = uniqueLines([
    ...(task.proposedFiles || []),
    ...((input.additionalFiles || []).map((item) => item.trim())),
  ]);

  const sections = [
    `Activate task ${task.id}.`,
    `Goal: ${task.title}`,
    '',
    'Canonical sources:',
    '- projecttracking.md row selected in the TUI.',
    task.specExcerpt
      ? '- SPEC.md excerpt attached below as the primary task-detail source.'
      : '- SPEC.md did not contain a matching section for this task.',
    task.description || task.bugAcceptance
      ? '- Linked bug/governance detail attached below when present.'
      : '- No linked bug detail was found for this task.',
    '',
    'Assumptions:',
    ...assumptions.map((line) => `- ${line}`),
    '',
    'Acceptance:',
    ...acceptance.map((line) => `- ${line}`),
    '',
    'Proposed files:',
    ...(proposedFiles.length > 0 ? proposedFiles.map((file) => `- ${file}`) : ['- none identified yet']),
  ];

  if (input.context && input.context.trim()) {
    sections.push('', 'Operator additions / corrections:', input.context.trim());
  }

  if (task.specExcerpt) {
    sections.push('', 'SPEC excerpt:', task.specExcerpt);
  }

  if (task.description) {
    sections.push('', 'Linked description:', task.description);
  }

  if (task.bugAcceptance) {
    sections.push('', 'Linked bug acceptance:', task.bugAcceptance);
  }

  sections.push('', 'Use this activation brief as the starting context. Ask clarifying questions if any operator correction conflicts with the spec.');
  return sections.filter(Boolean).join('\n');
}

export function readGovernanceDocs(projectRoot: string): GovernanceDoc[] {
  const govDir = findGovernanceDir(projectRoot);
  return GOVERNANCE_FILENAMES.map((doc) => {
    const docPath = doc.scope === 'root'
      ? path.join(projectRoot, doc.filename)
      : path.join(govDir, doc.filename);
    const text = readText(docPath);
    return {
      key: doc.key,
      title: doc.title,
      path: docPath,
      lines: text ? text.split('\n') : ['(missing)'],
    };
  });
}

export function parseTaskLedger(projectRoot: string): { active: TaskRecord[]; recent: TaskRecord[] } {
  const summary = readGovernanceSummary(projectRoot);
  const govDir = summary.governanceDir;
  const ptPath = summary.projecttrackingPath;
  const bugsText = readText(path.join(govDir, 'BUGS.md'));
  const resolvedText = readText(path.join(govDir, 'BUGS-resolved.md'));
  const ptText = readText(ptPath);
  const active: TaskRecord[] = [];
  const recent: TaskRecord[] = [];
  let section: 'active' | 'recent' | null = null;

  for (const rawLine of ptText.split('\n')) {
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

    const cols = normalizeTaskColumns(parseTableRow(rawLine));
    if (!cols) continue;
    const task: TaskRecord = {
      id: cols[0] || '',
      type: cols[1] || '',
      title: cols[2] || '',
      status: cols[3] || '',
      owner: cols[4] || '',
      branch: cols[5] || '',
      updated: cols[6] || '',
      links: cols[7] || '',
      backupRef: cols[8] || '',
      acceptance: cols[9] || '',
    };
    if (!task.id) continue;

    const bugIdMatch = task.title.match(/BUG-\d+/i) || task.links.match(/BUG-\d+/i);
    const bugId = bugIdMatch ? bugIdMatch[0].toUpperCase() : '';
    const bugSection = findBugSection(bugsText, bugId) || findBugSection(resolvedText, bugId);
    if (bugSection) {
      task.description = extractField(bugSection, 'Description') || undefined;
      task.bugAcceptance = extractField(bugSection, 'Acceptance') || undefined;
    }

    const spec = extractSpecExcerpt(projectRoot, task);
    task.specExcerpt = spec.excerpt || undefined;
    task.proposedFiles = spec.files;

    const targetSection = section === 'active' && isCompletedStatus(task.status) ? 'recent' : section;
    if (targetSection === 'active') active.push(task);
    else recent.push(task);
  }

  return { active, recent };
}

export function deriveNextTaskId(projectRoot: string, lane: string): string {
  const ptText = readText(path.join(findGovernanceDir(projectRoot), 'projecttracking.md'));
  const normalizedLane = lane.trim().replace(/^v/, '');
  const nextTaskHeader = parseHeaderValue(ptText, 'Next Task');
  const headerMatch = nextTaskHeader.match(new RegExp(`^v${escapeRegex(normalizedLane)}\\.(\\d+)$`));
  if (headerMatch && !ptText.includes(`| ${nextTaskHeader} |`)) {
    return nextTaskHeader;
  }
  const matches = [...ptText.matchAll(new RegExp(`\\bv${escapeRegex(normalizedLane)}\\.(\\d+)\\b`, 'g'))]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  const next = matches.length ? Math.max(...matches) + 1 : 1;
  return `v${normalizedLane}.${String(next)}`;
}

export function findTaskById(projectRoot: string, taskId: string): { task: TaskRecord | null; section: 'active' | 'recent' | null } {
  const normalized = String(taskId || '').trim();
  if (!normalized) return { task: null, section: null };

  const ledger = parseTaskLedger(projectRoot);
  const activeTask = ledger.active.find((task) => String(task.id).trim().toLowerCase() === normalized.toLowerCase());
  if (activeTask) return { task: activeTask, section: 'active' };

  const recentTask = ledger.recent.find((task) => String(task.id).trim().toLowerCase() === normalized.toLowerCase());
  if (recentTask) return { task: recentTask, section: 'recent' };

  return { task: null, section: null };
}

export function appendTaskRecord(projectRoot: string, task: TaskRecord): void {
  const ptPath = path.join(findGovernanceDir(projectRoot), 'projecttracking.md');
  const text = readText(ptPath);
  if (!text) throw new Error('projecttracking.md is missing');

  const row = `| ${task.id} | ${task.type} | ${task.title} | ${task.status} | ${task.owner} | ${task.branch || '-'} | ${task.updated} | ${task.links || '-'} | ${task.backupRef || '-'} | ${task.acceptance} |`;
  const marker = '\n---\n\n## Recently Completed';
  const index = text.indexOf(marker);
  if (index === -1) throw new Error('Could not find insertion point for Active Tasks');

  const before = text.slice(0, index).replace(/\s*$/, '');
  const after = text.slice(index);
  const next = `${before}\n${row}\n${after}`;
  fs.writeFileSync(ptPath, next, 'utf8');
}

export function createTaskFromDraft(projectRoot: string, draft: TaskDraftInput): TaskRecord {
  const lane = draft.lane || '0.3';
  const id = deriveNextTaskId(projectRoot, lane);
  return {
    id,
    type: 'feat',
    title: draft.title.trim(),
    status: 'READY',
    owner: draft.owner || 'unassigned',
    branch: '-',
    updated: new Date().toISOString().slice(0, 10),
    links: '-',
    backupRef: '-',
    acceptance: draft.acceptance.trim(),
  };
}
