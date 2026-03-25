'use strict';

const fs = require('fs');
const path = require('path');

function formatStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
}

function sanitizeRunId(runId) {
  const value = String(runId || 'session').replace(/[^a-zA-Z0-9_-]/g, '');
  return value.slice(0, 12) || 'session';
}

function startSessionLog({ projectRoot, runId = null, mode = 'runtime' } = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const logsDir = path.join(root, '.mbo', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const filePath = path.join(logsDir, 'session-' + formatStamp() + '-' + mode + '-' + sanitizeRunId(runId) + '.log');
  const stream = fs.createWriteStream(filePath, { flags: 'a' });
  const restores = [];
  let closed = false;

  const tee = (targetName) => {
    const target = process[targetName];
    if (!target || typeof target.write !== 'function') return;
    const original = target.write.bind(target);
    target.write = (chunk, encoding, callback) => {
      try {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
        stream.write(buffer);
      } catch {}
      return original(chunk, encoding, callback);
    };
    restores.push(() => {
      target.write = original;
    });
  };

  const writeMeta = (message) => {
    try {
      stream.write('[session ' + new Date().toISOString() + '] ' + message + '\n');
    } catch {}
  };

  // Direct-write conversation logger — bypasses stdout/stderr entirely.
  // Use for all TUI conversation events (user input, operator output, status events)
  // so they appear timestamped regardless of Ink's stdout patching.
  const logEvent = (category, message) => {
    try {
      const lines = String(message || '').split('\n');
      for (const line of lines) {
        if (line === '') continue;
        stream.write('[session ' + new Date().toISOString() + '] ' + category + ' ' + line + '\n');
      }
    } catch {}
  };

  // tee('stdout') removed — Ink redraws stdout constantly, producing 60MB+ of ANSI noise.
  // Pipeline output is captured cleanly via operator._chunkLogger → writeMeta instead.
  tee('stderr');
  writeMeta('start mode=' + mode + ' runId=' + (runId || 'none') + ' pid=' + process.pid + ' cwd=' + process.cwd());

  const exitHandler = () => {
    close('process exit');
  };

  process.once('exit', exitHandler);

  function close(reason = null) {
    if (closed) return;
    closed = true;
    process.removeListener('exit', exitHandler);
    if (reason) writeMeta(reason);
    while (restores.length > 0) {
      try {
        const restore = restores.pop();
        if (typeof restore === 'function') restore();
      } catch {}
    }
    try {
      stream.end('[session ' + new Date().toISOString() + '] closed\n');
    } catch {}
  }

  return {
    path: filePath,
    writeMeta,
    logEvent,
    close() {
      close();
    }
  };
}

// Module-level singleton — set from the TUI entry point after both the operator
// and session log are ready, so operator._chunkLogger can write to it.
let _activeLog = null;
function setActiveLog(log) { _activeLog = log; }
function getActiveLog() { return _activeLog; }

module.exports = { startSessionLog, setActiveLog, getActiveLog };
