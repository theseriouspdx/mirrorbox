/**
 * src/utils/root.js — MBO Project Root Resolution
 * Walks up the directory tree from process.cwd() looking for .mbo/
 * per Section 28.1.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Recursively find the project root by looking for a .mbo/ directory.
 * @param {string} current — the current directory to check
 * @returns {string} — the absolute path to the project root
 */
function findProjectRoot(current = process.cwd()) {
  const checkPath = path.join(current, '.mbo');
  
  // If .mbo/ exists in the current directory, we found the root.
  if (fs.existsSync(checkPath) && fs.statSync(checkPath).isDirectory()) {
    return current;
  }

  // Reach the system root (e.g., / or C:\)
  const parent = path.dirname(current);
  if (parent === current) {
    return process.cwd();
  }

  // Recurse upward
  return findProjectRoot(parent);
}

module.exports = { findProjectRoot };
