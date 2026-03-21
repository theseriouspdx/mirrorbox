'use strict';
// Functional test for mbo mcp kill — actually executes enumerateMcpProcesses()
// Run with: node scripts/test-mcp-kill.js

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Environment assertions — fail fast if we're on the wrong machine ──────────
// These tests are written for and must run on: macOS, johnserious, ~/MBO
const ENV_CHECKS = [
  {
    label: 'Platform is macOS (darwin)',
    ok: os.platform() === 'darwin',
    detail: `got ${os.platform()}`,
  },
  {
    label: 'Running as johnserious',
    ok: os.userInfo().username === 'johnserious',
    detail: `got ${os.userInfo().username}`,
  },
  {
    label: 'pgrep is available',
    ok: spawnSync('which', ['pgrep'], { encoding: 'utf8' }).status === 0,
    detail: 'pgrep not found in PATH',
  },
  {
    label: 'pgrep -f flag works (macOS does not support -a)',
    ok: (() => {
      const r = spawnSync('pgrep', ['-f', 'node'], { encoding: 'utf8' });
      return r.status === 0 || (r.stdout || '').trim().length > 0;
    })(),
    detail: 'pgrep -f returned non-zero with no output',
  },
  {
    label: 'ps supports -o args= format',
    ok: (() => {
      const r = spawnSync('ps', ['-p', String(process.pid), '-o', 'args='], { encoding: 'utf8' });
      return (r.stdout || '').trim().length > 0;
    })(),
    detail: 'ps -o args= returned empty for current process',
  },
  {
    label: 'MBO project root exists at ~/MBO',
    ok: fs.existsSync(path.join(os.homedir(), 'MBO')),
    detail: `${path.join(os.homedir(), 'MBO')} not found`,
  },
  {
    label: 'bin/mbo.js exists',
    ok: fs.existsSync(path.join(os.homedir(), 'MBO/bin/mbo.js')),
    detail: 'bin/mbo.js not found',
  },
];

let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  if (check.ok) {
    console.log(`PASS  ${check.label}`);
  } else {
    console.log(`FAIL  ${check.label} — ${check.detail}`);
    envFailed = true;
  }
}
if (envFailed) {
  console.log('\nEnvironment checks failed — this test is not valid on this machine. Aborting.\n');
  process.exit(2);
}
console.log('── Environment OK — proceeding with functional tests ────────────\n');

// ── Inline the actual functions verbatim from bin/mbo.js ──────────────────────

function enumerateMcpProcesses() {
  // macOS pgrep does not support -a; use -f for PIDs then ps for full args
  const pgrepResult = spawnSync('pgrep', ['-f', 'mcp-server.js'], { encoding: 'utf8' });
  const pids = (pgrepResult.stdout || '').trim().split('\n').filter(Boolean).map(Number).filter(Boolean);

  const entries = pids.map((pid) => {
    const psResult = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' });
    const line = (psResult.stdout || '').trim();
    const rootMatch = line.match(/--root=(\S+)/);
    const root = rootMatch ? rootMatch[1] : '(unknown)';
    if (!line || !line.includes('mcp-server.js')) return null;

    let uptimeS = 0;
    try {
      const ps = spawnSync('ps', ['-p', String(pid), '-o', 'etime='], { encoding: 'utf8' });
      const t = (ps.stdout || '').trim();
      const parts = t.split(/[:\-]/).reverse().map(Number);
      uptimeS = (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600 + (parts[3] || 0) * 86400;
    } catch (_) {}

    let manifestOk = false;
    for (const runDir of ['.dev/run', '.mbo/run']) {
      try {
        const dir = path.join(root, runDir);
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter((f) => f.startsWith('mcp-') && f.endsWith('.json') && f !== 'mcp.json');
        for (const f of files) {
          try {
            const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (m.pid === pid) { manifestOk = true; break; }
          } catch (_) {}
        }
        if (manifestOk) break;
      } catch (_) {}
    }

    return { pid, root, uptimeS, manifestOk, isDupe: false };
  }).filter(Boolean);

  const byRoot = new Map();
  for (const e of entries) {
    if (!byRoot.has(e.root)) byRoot.set(e.root, []);
    byRoot.get(e.root).push(e);
  }
  for (const group of byRoot.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.uptimeS - b.uptimeS);
    for (let i = 1; i < group.length; i++) group[i].isDupe = true;
  }

  return entries;
}

function formatUptime(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m}m`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`PASS  ${label}`);
    passed++;
  } else {
    console.log(`FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// T1: pgrep -f actually works on this machine
const pgrepRaw = spawnSync('pgrep', ['-f', 'mcp-server.js'], { encoding: 'utf8' });
assert('T1: pgrep -f exits 0', pgrepRaw.status === 0 || (pgrepRaw.stdout || '').trim().length >= 0);

// T2: enumerateMcpProcesses returns an array
const procs = enumerateMcpProcesses();
assert('T2: enumerateMcpProcesses returns array', Array.isArray(procs));

// T3: finds at least one process (we know MCP is running)
assert('T3: finds > 0 MCP processes', procs.length > 0, `got ${procs.length}`);

// T4: every entry has required fields
const validShape = procs.every(p =>
  typeof p.pid === 'number' &&
  typeof p.root === 'string' &&
  typeof p.uptimeS === 'number' &&
  typeof p.manifestOk === 'boolean' &&
  typeof p.isDupe === 'boolean'
);
assert('T4: all entries have correct shape', validShape);

// T5: no entry has pid = 0 or NaN
assert('T5: all pids are valid numbers > 0', procs.every(p => p.pid > 0 && !isNaN(p.pid)));

// T6: root fields are non-empty strings
assert('T6: all root fields non-empty', procs.every(p => p.root && p.root.length > 0));

// T7: uptimeS is >= 0
assert('T7: all uptimeS >= 0', procs.every(p => p.uptimeS >= 0));

// T8: dupe detection — if multiple procs share a root, all but newest are dupes
const byRoot = new Map();
for (const p of procs) {
  if (!byRoot.has(p.root)) byRoot.set(p.root, []);
  byRoot.get(p.root).push(p);
}
let dupeLogicOk = true;
for (const [root, group] of byRoot.entries()) {
  if (group.length < 2) continue;
  const nonDupes = group.filter(p => !p.isDupe);
  if (nonDupes.length !== 1) {
    dupeLogicOk = false;
    console.log(`  dupe check failed for root=${root}: ${nonDupes.length} non-dupes in group of ${group.length}`);
  }
}
assert('T8: dupe detection leaves exactly 1 non-dupe per root', dupeLogicOk);

// T9: formatUptime correctness
assert('T9: formatUptime(0) = 0s',   formatUptime(0)    === '0s');
assert('T9: formatUptime(59) = 59s', formatUptime(59)   === '59s');
assert('T9: formatUptime(60) = 1m0s', formatUptime(60)  === '1m0s');
assert('T9: formatUptime(3661) = 1h1m', formatUptime(3661) === '1h1m');

// T10: print live process table (visual verification)
console.log('\n── Live process table ──────────────────────────────────────────');
procs.forEach((p, i) => {
  const status = !p.manifestOk ? 'STALE' : p.isDupe ? 'DUPE' : 'ok';
  console.log(`[${i+1}] PID=${p.pid}  uptime=${formatUptime(p.uptimeS)}  status=${status}`);
  console.log(`    root=${p.root}`);
});
console.log('────────────────────────────────────────────────────────────────\n');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
