'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const rl_  = require('readline');
const { execSync, spawnSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');

const { detectProviders }           = require('./detect-providers');
const { detectShell, appendExportIfMissing } = require('./shell-profile');

const CONFIG_DIR  = path.join(os.homedir(), '.mbo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const DEFAULT_CONTROLLER_ROOT = path.resolve(__dirname, '../..');

function canonicalPath(p) {
  try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); }
}

function cleanupLegacyDaemon() {
  const legacyPlist = path.join(LAUNCH_AGENTS_DIR, 'com.mbo.mcp.plist');
  if (fs.existsSync(legacyPlist)) {
    console.error(`[MBO] Migrating: unloading legacy global daemon (com.mbo.mcp.plist)`);
    spawnSync('launchctl', ['unload', '-w', legacyPlist]);
    try { fs.unlinkSync(legacyPlist); } catch (_) {}
  }
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPlist({ projectRoot, controllerRoot, nodePath, projectId }) {
  const root = xmlEscape(projectRoot);
  const controller = xmlEscape(controllerRoot);
  const node = xmlEscape(nodePath);
  const nodeBin = xmlEscape(path.dirname(nodePath));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mbo.mcp.${projectId}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${controller}/src/graph/mcp-server.js</string>
    <string>--port=0</string>
    <string>--mode=dev</string>
    <string>--root=${root}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${root}</string>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${nodeBin}:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${root}/.dev/logs/mcp-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${root}/.dev/logs/mcp-stderr.log</string>
</dict>
</plist>
`;
}

function waitForHealth(projectRoot, projectId, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  const devManifest = path.join(projectRoot, '.dev/run/mcp.json');
  const userManifest = path.join(projectRoot, '.mbo/run/mcp.json');
  const canonicalRoot = canonicalPath(projectRoot);

  const isPidAlive = (pid) => {
    try { process.kill(pid, 0); return true; } catch (_) { return false; }
  };

  const readManifest = (manifestPath) => {
    try {
      if (!fs.existsSync(manifestPath)) return null;
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {
      return null;
    }
  };

  const pickLiveManifest = (runDir) => {
    if (!fs.existsSync(runDir)) return null;
    const files = fs.readdirSync(runDir)
      .filter((f) => f.startsWith(`mcp-${projectId}-`) && f.endsWith('.json'))
      .map((f) => path.join(runDir, f));

    files.sort((a, b) => {
      try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch (_) { return 0; }
    });

    for (const fp of files) {
      const m = readManifest(fp);
      if (!m || m.project_id !== projectId || !m.port || !m.pid) continue;
      if (!isPidAlive(m.pid)) continue;
      return m;
    }
    return null;
  };

  const getPort = () => {
    let data = null;
    for (const mp of [devManifest, userManifest]) {
      data = readManifest(mp);
      if (data) break;
    }

    // Handle dead PID, missing symlink target, or unreadable symlink target.
    if (!data || data.project_id !== projectId || !data.pid || !isPidAlive(data.pid)) {
      data = pickLiveManifest(path.dirname(devManifest)) || pickLiveManifest(path.dirname(userManifest));
    }

    if (data && data.project_id === projectId && data.port) return data.port;
    return null;
  };

  const attempt = () => new Promise((resolve) => {
    const port = getPort();
    if (!port) return resolve(false);

    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c.toString(); });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(false);
        try {
          const json = JSON.parse(body);
          resolve(json && json.status === 'ok' && canonicalPath(json.project_root) === canonicalRoot);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => req.destroy());
  });

  return new Promise(async (resolve) => {
    while (Date.now() < deadline) {
      if (await attempt()) return resolve(true);
      await new Promise((r) => setTimeout(r, 400));
    }
    resolve(false);
  });
}

async function installMCPDaemon(projectRoot = process.env.MBO_PROJECT_ROOT || process.cwd()) {
  const resolvedRoot = path.resolve(projectRoot);
  cleanupLegacyDaemon();
  fs.mkdirSync(path.join(resolvedRoot, '.dev', 'logs'), { recursive: true });
  fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });

  let controllerRoot = DEFAULT_CONTROLLER_ROOT;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg && typeof cfg.controllerRoot === 'string' && cfg.controllerRoot.trim()) {
      controllerRoot = path.resolve(cfg.controllerRoot);
    }
  } catch {
    // Fall back to the installed package root if config is absent/corrupt.
  }

  let nodePath = '';
  try {
    nodePath = execSync('which node', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Could not resolve node binary via `which node`.');
  }
  if (!nodePath) {
    throw new Error('Node binary path is empty.');
  }

  const projectId = crypto.createHash('sha256').update(Buffer.from(resolvedRoot, 'utf8')).digest('hex').slice(0, 16);
  const plistName = `com.mbo.mcp.${projectId}.plist`;
  const plistPath = path.join(LAUNCH_AGENTS_DIR, plistName);

  const plist = buildPlist({ projectRoot: resolvedRoot, controllerRoot, nodePath, projectId });
  fs.writeFileSync(plistPath, plist, 'utf8');

  // BUG-077: clean up orphaned pid-specific manifests before launching a new daemon.
  // These accumulate when the daemon is killed (SIGKILL/crash) without graceful shutdown.
  const devRunDir = path.join(resolvedRoot, '.dev/run');
  let removedManifestCount = 0;
  if (fs.existsSync(devRunDir)) {
    for (const f of fs.readdirSync(devRunDir)) {
      if (!f.startsWith(`mcp-${projectId}-`) || !f.endsWith('.json')) continue;
      const mf = path.join(devRunDir, f);
      try {
        const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
        let pidAlive = false;
        try { process.kill(m.pid, 0); pidAlive = true; } catch (_) {}
        if (!pidAlive) {
          fs.unlinkSync(mf);
          removedManifestCount += 1;
        }
      } catch (_) {}
    }

    // Repair dangling mcp.json symlink if cleanup removed its target.
    if (removedManifestCount > 0) {
      const symlinkPath = path.join(devRunDir, 'mcp.json');
      try {
        if (fs.existsSync(symlinkPath)) {
          const target = fs.readlinkSync(symlinkPath);
          const targetPath = path.join(devRunDir, target);
          if (!fs.existsSync(targetPath)) {
            const remaining = fs.readdirSync(devRunDir)
              .filter((f) => f.startsWith(`mcp-${projectId}-`) && f.endsWith('.json'))
              .sort((a, b) => {
                try {
                  return fs.statSync(path.join(devRunDir, b)).mtimeMs - fs.statSync(path.join(devRunDir, a)).mtimeMs;
                } catch (_) {
                  return 0;
                }
              });

            fs.unlinkSync(symlinkPath);
            if (remaining.length > 0) {
              fs.symlinkSync(remaining[0], symlinkPath);
            }
          }
        }
      } catch (_) {}
    }
  }

  // Check if a healthy daemon is already running for this project — skip restart if so.
  // This preserves the existing ephemeral port across sessions (no unnecessary port churn).
  const alreadyHealthy = await waitForHealth(resolvedRoot, projectId, 2000);
  if (!alreadyHealthy) {
    const unload = spawnSync('launchctl', ['unload', '-w', plistPath], { encoding: 'utf8' });
    if ((unload.status || 0) !== 0 && !(unload.stderr || '').includes('No such process')) {
      // best-effort unload; non-fatal here
    }

    const load = spawnSync('launchctl', ['load', '-w', plistPath], { encoding: 'utf8' });
    if ((load.status || 0) !== 0) {
      throw new Error(`launchctl load failed: ${(load.stderr || load.stdout || '').trim()}`);
    }

    const healthy = await waitForHealth(resolvedRoot, projectId, 10000);
    if (!healthy) {
      throw new Error('Graph server did not become healthy within 10s. Check logs in .dev/logs/');
    }
  }

  // Read live port from manifest and update all registered agent client configs.
  const { updateClientConfigs } = require('../utils/update-client-configs');
  const devManifest  = path.join(resolvedRoot, '.dev/run/mcp.json');
  const userManifest = path.join(resolvedRoot, '.mbo/run/mcp.json');
  let port = null;
  try {
    if (fs.existsSync(devManifest))       port = JSON.parse(fs.readFileSync(devManifest,  'utf8')).port;
    else if (fs.existsSync(userManifest)) port = JSON.parse(fs.readFileSync(userManifest, 'utf8')).port;
  } catch (_) {}
  if (port) updateClientConfigs(resolvedRoot, port);
}

function persistInstallMetadata(configPath = CONFIG_PATH, installRoot = process.cwd(), options = {}) {
  const force = !!(options && options.force);
  let current = {};
  if (fs.existsSync(configPath)) {
    try {
      current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      current = {};
    }
  }
  const resolvedRoot = path.resolve(installRoot);
  const currentController = typeof current.controllerRoot === 'string' ? path.resolve(current.controllerRoot) : null;

  // Preserve existing controllerRoot unless explicitly forced.
  const controllerRoot = (!force && currentController)
    ? currentController
    : resolvedRoot;

  const updated = {
    ...current,
    controllerRoot,
    installRoot: controllerRoot,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

function runTeardown(projectRoot = process.env.MBO_PROJECT_ROOT || process.cwd()) {
  const resolvedRoot = path.resolve(projectRoot);
  cleanupLegacyDaemon();
  const projectId = crypto.createHash('sha256').update(Buffer.from(resolvedRoot, 'utf8')).digest('hex').slice(0, 16);
  const plistPath = path.join(LAUNCH_AGENTS_DIR, `com.mbo.mcp.${projectId}.plist`);

  if (fs.existsSync(plistPath)) {
    const unload = spawnSync('launchctl', ['unload', '-w', plistPath], { encoding: 'utf8' });
    if ((unload.status || 0) !== 0 && !(unload.stderr || '').includes('No such process')) {
      throw new Error(`launchctl unload failed: ${(unload.stderr || unload.stdout || '').trim()}`);
    }
    try {
      fs.unlinkSync(plistPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // Cleanup manifests
  const devManifest = path.join(resolvedRoot, '.dev/run/mcp.json');
  const userManifest = path.join(resolvedRoot, '.mbo/run/mcp.json');
  try { if (fs.existsSync(devManifest)) fs.unlinkSync(devManifest); } catch (_) {}
  try { if (fs.existsSync(userManifest)) fs.unlinkSync(userManifest); } catch (_) {}
}

// ANSI helpers
const R   = '\x1b[0m';
const m   = s => `\x1b[35m${s}${R}`;
const cy  = s => `\x1b[1m\x1b[36m${s}${R}`;
const dim = s => `\x1b[2m${s}${R}`;
const wb  = s => `\x1b[1m${s}${R}`;
const red = s => `\x1b[31m${s}${R}`;

function buildDefaultConfig(d) {
  const operator = d.geminiCLI
    ? { provider: 'google',     model: 'gemini-2.5-flash' }
    : d.anthropicKey
    ? { provider: 'anthropic',  model: 'claude-haiku-4-5-20251001' }
    : { provider: 'google',     model: 'gemini-2.5-flash' };

  const largeR  = d.ollamaModels.find(n => /70b|72b|reasoning|qwq|deepseek-r/i.test(n));
  const planner = largeR
    ? { provider: 'ollama',     model: largeR }
    : d.geminiCLI
    ? { provider: 'google',     model: 'gemini-2.5-flash' }
    : d.claudeCLI
    ? { provider: 'claude-cli', model: 'claude-sonnet-4-6' }
    : { provider: 'google',     model: 'gemini-2.5-flash' };

  const largeC   = d.ollamaModels.find(n => /30b|34b|coder|codestral|deepseek.*coder/i.test(n));
  const reviewer = largeC
    ? { provider: 'ollama',     model: largeC }
    : d.claudeCLI
    ? { provider: 'claude-cli', model: 'claude-sonnet-4-6' }
    : { provider: 'google',     model: 'gemini-2.5-pro' };

  const tiebreaker = d.claudeCLI
    ? { provider: 'claude-cli', model: 'claude-opus-4-6' }
    : d.anthropicKey
    ? { provider: 'anthropic',  model: 'claude-opus-4-6' }
    : d.openrouterKey
    ? { provider: 'openrouter', model: 'anthropic/claude-opus-4-6' }
    : { provider: 'google',     model: 'gemini-2.5-pro' };

  const cli = d.claudeCLI ? 'claude' : d.codexCLI ? 'codex' : 'gemini';

  return {
    operator, planner, reviewer, tiebreaker,
    executor:  { cli },
    streaming: {
      enabled: true,
      roles: {}
    },
    devServer: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getRoleOptions(role, d) {
  const opts = [];
  const push = (label, provider, model) => opts.push({ label, provider, model });

  if (role === 'operator') {
    if (d.geminiCLI)     push('gemini CLI → gemini-2.5-flash  ★',           'google',     'gemini-2.5-flash');
    if (d.claudeCLI)     push('claude CLI → claude-haiku-4-5',               'claude-cli', 'claude-haiku-4-5-20251001');
    if (d.openrouterKey) push('OpenRouter → google/gemini-2.5-flash',        'openrouter', 'google/gemini-2.5-flash');
  }
  if (role === 'planner') {
    d.ollamaModels.filter(n => /70b|72b|reasoning|qwq/i.test(n)).slice(0, 2)
      .forEach(n => push(`Ollama → ${n}`, 'ollama', n));
    if (d.geminiCLI)     push('gemini CLI → gemini-2.5-pro  ★',             'google',     'gemini-2.5-pro');
    if (d.claudeCLI)     push('claude CLI → claude-sonnet-4-6',              'claude-cli', 'claude-sonnet-4-6');
    if (d.openrouterKey) push('OpenRouter → google/gemini-2.5-pro',          'openrouter', 'google/gemini-2.5-pro');
  }
  if (role === 'reviewer') {
    d.ollamaModels.filter(n => /coder|codestral|deepseek.*coder/i.test(n)).slice(0, 2)
      .forEach(n => push(`Ollama → ${n}`, 'ollama', n));
    if (d.claudeCLI)     push('claude CLI → claude-sonnet-4-6  ★',          'claude-cli', 'claude-sonnet-4-6');
    if (d.geminiCLI)     push('gemini CLI → gemini-2.5-pro',                 'google',     'gemini-2.5-pro');
    if (d.openrouterKey) push('OpenRouter → anthropic/claude-sonnet-4-6',    'openrouter', 'anthropic/claude-sonnet-4-6');
  }
  if (role === 'tiebreaker') {
    if (d.claudeCLI)     push('claude CLI → claude-opus-4-6  ★',            'claude-cli', 'claude-opus-4-6');
    if (d.anthropicKey)  push('Anthropic API → claude-opus-4-6',             'anthropic',  'claude-opus-4-6');
    if (d.openrouterKey) push('OpenRouter → anthropic/claude-opus-4-6',      'openrouter', 'anthropic/claude-opus-4-6');
    if (d.geminiCLI)     push('gemini CLI → gemini-2.5-pro',                 'google',     'gemini-2.5-pro');
  }
  push('Custom slug (openrouter.ai/models)', 'openrouter', '__custom__');
  return opts;
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, a => resolve(a.trim())));
}

async function pickRole(rl, role, defaultVal, d) {
  const opts = getRoleOptions(role, d);
  const desc = { operator: 'fast classifier', planner: 'reasoning/plan', reviewer: 'code critic', tiebreaker: 'final arbiter' };
  console.log(`\n  ${m(role)} — ${dim(desc[role])}`);
  opts.forEach((o, i) => {
    const mark = o.model === defaultVal.model ? dim(' ← default') : '';
    console.log(`    ${m(String(i + 1) + '.')} ${o.label}${mark}`);
  });
  const choice = await ask(rl, wb(`  Select [1-${opts.length}] or Enter for default: `));
  const idx = parseInt(choice, 10) - 1;
  if (idx < 0 || idx >= opts.length) return defaultVal;
  if (opts[idx].model === '__custom__') {
    const slug = await ask(rl, '  Enter model slug (e.g. anthropic/claude-sonnet-4-6): ');
    return slug ? { provider: 'openrouter', model: slug } : defaultVal;
  }
  return { provider: opts[idx].provider, model: opts[idx].model };
}

function validateConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return false;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    JSON.parse(raw);
    return true;
  } catch (err) {
    const corruptPath = `${CONFIG_PATH}.corrupt.${Date.now()}`;
    process.stderr.write(`[WARN] Config corrupt: ${err.message}. Renaming to ${path.basename(corruptPath)}\n`);
    fs.renameSync(CONFIG_PATH, corruptPath);
    return false;
  }
}

async function runSetup() {
  if (!process.stdout.isTTY) {
    process.stderr.write('ERROR: mbo setup requires a TTY. Missing ~/.mbo/config.json.\n');
    process.stderr.write('\nConfigure your CI/CD environment with these variables:\n');
    process.stderr.write('  export OPENROUTER_API_KEY="your_key"\n');
    process.stderr.write('  export ANTHROPIC_API_KEY="your_key"\n');
    process.stderr.write('\nAlternatively, mount a valid config to ~/.mbo/config.json.\n');
    process.exit(1);
  }

  console.log('');
  console.log(m('╔════════════════════════════════════════╗'));
  console.log(m('║') + wb('  Mirror Box Orchestrator — Setup      ') + m('║'));
  console.log(m('╚════════════════════════════════════════╝'));
  console.log(dim('\nScanning your system...\n'));

  const d = await detectProviders();

  console.log(cy('── CLI Tools ──────────────────────────────────────────────'));
  console.log(`  claude  ${d.claudeCLI ? cy('✓ found') : red('✗ not found')}`);
  console.log(`  gemini  ${d.geminiCLI ? cy('✓ found') : red('✗ not found')}`);
  console.log(`  codex   ${d.codexCLI  ? cy('✓ found') : red('✗ not found')}`);
  console.log(cy('\n── Local Models (Ollama) ──────────────────────────────────'));
  if (d.ollamaModels.length === 0) {
    console.log(dim('  No Ollama instance found (or no models loaded)'));
  } else {
    d.ollamaModels.slice(0, 8).forEach(n => console.log(`  ${m('•')} ${n}`));
    if (d.ollamaModels.length > 8) console.log(dim(`  ... and ${d.ollamaModels.length - 8} more`));
  }
  console.log(cy('\n── API Keys ───────────────────────────────────────────────'));
  console.log(`  OPENROUTER_API_KEY  ${d.openrouterKey ? cy('✓ set') : dim('○ not set')}`);
  console.log(`  ANTHROPIC_API_KEY   ${d.anthropicKey  ? cy('✓ set') : dim('○ not set')}`);
  console.log('');

  if (!d.claudeCLI && !d.geminiCLI && !d.codexCLI) {
    process.stderr.write('✗ No CLI tool found. Install claude, gemini, or codex and re-run: mbo setup\n');
    process.exit(1);
  }

  const rl = rl_.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!d.openrouterKey) {
      const key = await ask(rl, 'OpenRouter API key (Enter to skip): ');
      if (key) {
        d.openrouterKey = key;
        process.env.OPENROUTER_API_KEY = key;
        appendExportIfMissing(detectShell(), 'OPENROUTER_API_KEY', key);
        console.log(dim('  → Saved to shell profile.'));
      }
    }
    if (!d.anthropicKey) {
      const key = await ask(rl, 'Anthropic API key (Enter to skip): ');
      if (key) {
        d.anthropicKey = key;
        process.env.ANTHROPIC_API_KEY = key;
        appendExportIfMissing(detectShell(), 'ANTHROPIC_API_KEY', key);
        console.log(dim('  → Saved to shell profile.'));
      }
    }

    const defaults = buildDefaultConfig(d);
    console.log(cy('\n── Recommended Config ─────────────────────────────────────'));
    console.log(`  ${m('Stage 1')} Operator:    ${wb(defaults.operator.provider   + ' / ' + defaults.operator.model)}`);
    console.log(`  ${m('Stage 2')} Planner:     ${wb(defaults.planner.provider    + ' / ' + defaults.planner.model)}`);
    console.log(`  ${m('Stage 3')} Reviewer:    ${wb(defaults.reviewer.provider   + ' / ' + defaults.reviewer.model)}`);
    console.log(`  ${m('Stage 4')} Tiebreaker:  ${wb(defaults.tiebreaker.provider + ' / ' + defaults.tiebreaker.model)}`);
    console.log(`  ${m('Stage 5')} Executor:    ${wb(defaults.executor.cli + ' (local CLI)')}`);
    console.log('');

    const accept = await ask(rl, wb('Use this config? [Y/n]: '));
    const cfg = { ...defaults, updatedAt: new Date().toISOString() };

    if (accept.toLowerCase() === 'n' || accept.toLowerCase() === 'no') {
      console.log(cy('\n── Manual Role Assignment ──────────────────────────────────'));
      cfg.operator   = await pickRole(rl, 'operator',   defaults.operator,   d);
      cfg.planner    = await pickRole(rl, 'planner',    defaults.planner,    d);
      cfg.reviewer   = await pickRole(rl, 'reviewer',   defaults.reviewer,   d);
      cfg.tiebreaker = await pickRole(rl, 'tiebreaker', defaults.tiebreaker, d);
    }

    console.log(cy('\n── Streaming (Section 33) ──────────────────────────────────'));
    const streamGlobal = await ask(rl, '  Enable real-time output streaming? [Y/n]: ');
    cfg.streaming = {
      enabled: streamGlobal.toLowerCase() !== 'n' && streamGlobal.toLowerCase() !== 'no',
      roles: {}
    };

    const devCmd = await ask(rl, `${m('Dev server command')} ${dim('(e.g. "npm run dev", Enter to skip): ')}`);
    if (devCmd) cfg.devServer = devCmd;

    console.log(cy('\n── Project Configuration ──────────────────────────────────'));
    const projectRoot = process.env.MBO_PROJECT_ROOT || process.cwd();
    let defaultRoots = ['src'];
    try {
      if (!fs.existsSync(path.join(projectRoot, 'src'))) {
        const entries = fs.readdirSync(projectRoot);
        if (entries.includes('lib') && fs.statSync(path.join(projectRoot, 'lib')).isDirectory()) {
          defaultRoots = ['lib'];
        } else {
          const hasSrcFiles = entries.some(e => e.endsWith('.js') || e.endsWith('.py') || e.endsWith('.ts'));
          if (hasSrcFiles) defaultRoots = ['.'];
        }
      }
    } catch (_) {}

    const rootInput = await ask(rl, `  Scan roots (comma separated) [${defaultRoots.join(',')}]: `);
    const scanRoots = rootInput ? rootInput.split(',').map(s => s.trim()).filter(Boolean) : defaultRoots;

    const localConfigDir = path.join(projectRoot, '.mbo');
    const localConfigPath = path.join(localConfigDir, 'config.json');
    let localCfg = {};
    try {
      if (fs.existsSync(localConfigPath)) {
        localCfg = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
      }
    } catch (_) {}
    localCfg.scanRoots = scanRoots;
    localCfg.mcpClients = require('../utils/update-client-configs').buildClientRegistry(d);
    if (!fs.existsSync(localConfigDir)) fs.mkdirSync(localConfigDir, { recursive: true });
    fs.writeFileSync(localConfigPath, JSON.stringify(localCfg, null, 2), 'utf8');

    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');

    console.log('');
    console.log(cy(`✓ Config saved to ${CONFIG_PATH}`));
    console.log(dim('  Run "mbo" from your project directory to start.'));
    console.log('');
    return cfg;
  } finally {
    rl.close();
  }
}

module.exports = {
  runSetup,
  installMCPDaemon,
  runTeardown,
  validateConfig,
  persistInstallMetadata,
  CONFIG_PATH,
};
