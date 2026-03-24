'use strict';
/**
 * Task Reader — shared ledger access for operator.js
 * 
 * This module provides TaskRecord lookup without importing
 * from the TUI module tree directly. It delegates to the
 * compiled governance.js module at runtime.
 * 
 * Section 37.3F: The operator MUST re-fetch the canonical
 * TaskRecord from the governance ledger by taskId.
 * 
 * @see DID-reconciliation-final.md §2.4
 */
const path = require('path');

/**
 * Look up a task by ID from the governance ledger.
 * Re-reads projecttracking.md from disk on each call (not cached).
 *
 * @param {string} projectRoot - Project root directory
 * @param {string} taskId - e.g. "v0.14.09" or "BUG-223"
 * @returns {{ task: object|null, section: 'active'|'recent'|null }}
 */
function findTaskById(projectRoot, taskId) {
  try {
    const govModule = require(path.join(projectRoot, 'src/tui/governance.js'));
    return govModule.findTaskById(projectRoot, taskId);
  } catch (err) {
    // Governance module unavailable (pre-build state or missing).
    // Return not-found; caller (activateTask) returns TASK_NOT_FOUND.
    console.error(`[task-reader] Could not load governance module: ${err.message}`);
    return { task: null, section: null };
  }
}

module.exports = { findTaskById };