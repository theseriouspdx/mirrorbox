'use strict';

/**
 * update-client-configs.js
 *
 * Shared utility: writes the live MCP port to every agent client config file
 * registered in <projectRoot>/.mbo/config.json → mcpClients[].
 *
 * Called from two places:
 *   1. src/graph/mcp-server.js  — on daemon startup (covers launchd respawn)
 *   2. src/cli/setup.js         — after installMCPDaemon health check
 *
 * Schema (per entry in mcpClients):
 *   { "name": "claude", "configPath": ".mcp.json" }
 *   { "name": "gemini", "configPath": ".gemini/settings.json" }
 *
 * All configPaths are relative to projectRoot. Never global. Never cross-project.
 * Server name is always "mbo-graph". Full overwrite — one daemon per project.
 */

const fs   = require('fs');
const path = require('path');

/**
 * Build the MCP config payload for a given port.
 */
function buildPayload(port) {
  return JSON.stringify({
    mcpServers: {
      'mbo-graph': {
        type:    'http',
        url:     `http://127.0.0.1:${port}/mcp`,
        timeout: 30000
      }
    }
  }, null, 2) + '\n';
}

/**
 * Read mcpClients registry from <projectRoot>/.mbo/config.json.
 * Returns an array of { name, configPath } objects.
 * Returns [] if the file doesn't exist or has no mcpClients entry — never throws.
 */
function readRegistry(projectRoot) {
  const configPath = path.join(projectRoot, '.mbo', 'config.json');
  try {
    if (!fs.existsSync(configPath)) return [];
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (!Array.isArray(cfg.mcpClients) || cfg.mcpClients.length === 0) return [];
    return cfg.mcpClients.filter(c => c && typeof c.name === 'string' && typeof c.configPath === 'string');
  } catch (_) {
    return [];
  }
}

/**
 * Write the MCP URL to all registered client config files.
 *
 * @param {string} projectRoot  Absolute path to the project root.
 * @param {number} port         The live daemon port.
 * @param {object} [opts]
 * @param {function} [opts.log] Logger function (defaults to console.error).
 *
 * @returns {{ written: string[], skipped: string[], errors: string[] }}
 */
function updateClientConfigs(projectRoot, port, opts = {}) {
  const log = opts.log || ((msg) => console.error(msg));
  const result = { written: [], skipped: [], errors: [] };

  if (!projectRoot || typeof projectRoot !== 'string') {
    log(`[update-client-configs] Invalid projectRoot — skipping`);
    result.skipped.push('all');
    return result;
  }

  if (!port || typeof port !== 'number' || port <= 0) {
    log(`[update-client-configs] Invalid port ${port} — skipping`);
    result.skipped.push('all');
    return result;
  }

  const clients = readRegistry(projectRoot);

  if (clients.length === 0) {
    log(`[update-client-configs] No mcpClients registered in .mbo/config.json — skipping`);
    return result;
  }

  const payload = buildPayload(port);

  for (const client of clients) {
    const fullPath = path.join(projectRoot, client.configPath);
    try {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, payload);
      log(`[update-client-configs] ${client.name}: ${client.configPath} → port ${port}`);
      result.written.push(client.configPath);
    } catch (err) {
      log(`[update-client-configs] [WARN] ${client.name}: failed to write ${client.configPath}: ${err.message}`);
      result.errors.push(client.configPath);
    }
  }

  return result;
}

/**
 * Build the default mcpClients registry from detected providers.
 * Called by mbo setup to populate .mbo/config.json.
 *
 * @param {object} providers  Output of detect-providers.js detectProviders().
 * @returns {Array<{name: string, configPath: string}>}
 */
function buildClientRegistry(providers) {
  const clients = [];
  // Claude Code: always register — .mcp.json is standard regardless of CLI presence
  clients.push({ name: 'claude', configPath: '.mcp.json' });
  if (providers && providers.geminiCLI) {
    clients.push({ name: 'gemini', configPath: '.gemini/settings.json' });
  }
  // Codex: TBD — add entry here when configPath is known
  return clients;
}

module.exports = { updateClientConfigs, buildClientRegistry, readRegistry };
