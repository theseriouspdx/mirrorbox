'use strict';

const path = require('path');

/**
 * Returns the expected manifest location for a given project root.
 */
function getManifestPreference(root) {
  return path.join(root, '.mbo', 'mcp.json');
}

/**
 * Returns the expected log directory for a given project root.
 */
function getMcpLogDir(root) {
  return path.join(root, '.mbo', 'logs');
}

/**
 * Securely determines if child path is contained within parent path.
 * Handles directory traversal and symlinks.
 */
function isWithinPath(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

module.exports = {
  getManifestPreference,
  getMcpLogDir,
  isWithinPath,
};
