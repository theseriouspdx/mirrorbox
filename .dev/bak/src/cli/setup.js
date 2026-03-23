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
const SELF_RUN_WARNING = process.env.MBO_SELF_RUN_WARNING === '1';

function selfRunWarningBlock() {
  const controller = process.env.MBO_SELF_RUN_WARNING_CONTROLLER || process.cwd();
  return `\x1b[31m[MBO WARNING] MBO SHOULD NOT BE RUN FROM THE MBO DIRECTORY.\n[MBO WARNING] Controller: ${controller}\x1b[0m`;
}

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