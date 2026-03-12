'use strict';

/**
 * src/utils/resolve-manifest.js
 *
 * THE single source of truth for MCP manifest resolution.
 * All consumers (operator.js, mcp_query.js, mcp_http_query.js, watchdog)
 * import from here. Nothing else reads manifests directly.
 *
 * Resolution order:
 *   1. .dev/run/mcp.json  (dev repo — canonical for this project)
 *   2. .mbo/run/mcp.json  (runtime project fallback)
 *
 * Throws with an actionable message if:
 *   - Neither file exists
 *   - JSON is unparseable
 *   - manifest_version !== 3
 *   - port is missing or not a positive integer
 *   - status is not exactly "ready"
 *
 * No silent fallback to port 3737. Ever.
 */

const fs   = require('fs');
const path = require('path');

const MANIFEST_VERSION = 3;
const READY_STATUS     = 'ready';

/**
 * Return the canonical run directory for a given mode.
 * @param {'dev'|'runtime'} mode
 * @param {string} [root] — project root; defaults to MBO_PROJECT_ROOT or cwd
 */
function getRunDir(mode, root) {
  const r = root || process.env.MBO_PROJECT_ROOT || process.cwd();
  return mode === 'dev'
    ? path.join(r, '.dev', 'run')
    : path.join(r, '.mbo', 'run');
}

/**
 * Attempt to parse and validate a manifest file at the given path.
 * Returns the parsed object or null if the file doesn't exist.
 * Throws if the file exists but is invalid.
 * @param {string} filePath
 */
function tryReadManifest(filePath) {
  if (!fs.existsSync(filePath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(
      `MCP manifest at ${filePath} is not valid JSON: ${e.message}\n` +
      `Delete it and restart the server: bash scripts/mbo-start.sh --mode=dev --agent=operator`
    );
  }

  if (manifest.manifest_version !== MANIFEST_VERSION) {
    throw new Error(
      `MCP manifest version mismatch at ${filePath}. ` +
      `Expected ${MANIFEST_VERSION}, got ${manifest.manifest_version}.\n` +
      `Restart the server: bash scripts/mbo-start.sh --mode=dev --agent=operator`
    );
  }

  if (!Number.isInteger(manifest.port) || manifest.port <= 0) {
    throw new Error(
      `MCP manifest at ${filePath} has invalid port: ${manifest.port}.\n` +
      `Restart the server: bash scripts/mbo-start.sh --mode=dev --agent=operator`
    );
  }

  if (manifest.status !== READY_STATUS) {
    throw new Error(
      `MCP manifest at ${filePath} status is "${manifest.status}", not "ready".\n` +
      `The server is not running. Start it: bash scripts/mbo-start.sh --mode=dev --agent=operator`
    );
  }

  return manifest;
}

/**
 * Resolve the live MCP manifest.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.root]      — explicit project root
 * @param {boolean} [opts.mustReady] — if false, skip the status===ready check (used
 *                                     internally by the Operator while waiting for startup)
 * @returns {{ manifest: object, manifestPath: string }}
 */
function resolveManifest(opts) {
  const root      = (opts && opts.root) || process.env.MBO_PROJECT_ROOT || process.cwd();
  const mustReady = opts && opts.mustReady === false ? false : true;

  const devPath     = path.join(root, '.dev', 'run', 'mcp.json');
  const runtimePath = path.join(root, '.mbo', 'run', 'mcp.json');

  // Try dev path first, then runtime fallback
  for (const filePath of [devPath, runtimePath]) {
    let manifest;
    try {
      manifest = mustReady ? tryReadManifest(filePath) : tryReadManifestRelaxed(filePath);
    } catch (e) {
      // If the file exists but is invalid, surface the error immediately.
      // Don't silently fall through to the next candidate.
      throw e;
    }
    if (manifest) return { manifest, manifestPath: filePath };
  }

  throw new Error(
    `MCP manifest not found at:\n` +
    `  ${devPath}\n` +
    `  ${runtimePath}\n` +
    `Start the server: bash scripts/mbo-start.sh --mode=dev --agent=operator`
  );
}

/**
 * Like tryReadManifest but skips the status===ready check.
 * Used by _waitForMCPReady() to poll during startup.
 */
function tryReadManifestRelaxed(filePath) {
  if (!fs.existsSync(filePath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
  if (manifest.manifest_version !== MANIFEST_VERSION) return null;
  if (!Number.isInteger(manifest.port) || manifest.port <= 0) return null;
  return manifest;
}

/**
 * Convenience: return just the manifest object.
 * Callers that only need the port: resolveManifest().manifest.port
 */
function readManifest(opts) {
  try {
    return resolveManifest(opts).manifest;
  } catch {
    return null;
  }
}

/**
 * Resolve the port from the live manifest.
 * Throws if not ready.
 */
function resolvePort(opts) {
  return resolveManifest(opts).manifest.port;
}

module.exports = { resolveManifest, readManifest, resolvePort, getRunDir, tryReadManifestRelaxed };
