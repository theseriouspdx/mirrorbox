/**
 * MBO Runtime Probe (0.8A)
 * This script is injected into the Subject container to capture runtime signals.
 * It uses Node.js hooks to trace function calls and dependency loading.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalResolve = Module._resolveFilename;
const traceLog = [];

Module._resolveFilename = function(request, parent, isMain, options) {
  const resolved = originalResolve.apply(this, arguments);
  if (resolved.includes('/project/') && !resolved.includes('node_modules')) {
    traceLog.push({
      type: 'dependency',
      source: parent ? path.relative('/project', parent.filename) : 'main',
      target: path.relative('/project', resolved),
      timestamp: Date.now()
    });
  }
  return resolved;
};

process.on('exit', () => {
  try {
    fs.writeFileSync('/project/data/runtime-trace.json', JSON.stringify(traceLog, null, 2));
  } catch (e) {
    console.error('[MBO Probe] Failed to write trace:', e.message);
  }
});

console.error('[MBO Probe] Runtime instrumentation active.');
