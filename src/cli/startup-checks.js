'use strict';

const fs = require('fs');
const path = require('path');

function readPackageName(dir) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const json = JSON.parse(raw);
    return typeof json.name === 'string' ? json.name : null;
  } catch {
    return null;
  }
}

function findNearestPackageDir(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readConfig(pathLike) {
  try {
    if (!pathLike || !fs.existsSync(pathLike)) return null;
    const raw = fs.readFileSync(pathLike, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isManagedControllerInstall(invocationCwd) {
  const home = process.env.HOME || '';
  const cfgPath = path.join(home, '.mbo', 'config.json');
  const cfg = readConfig(cfgPath);
  if (!cfg || typeof cfg !== 'object') return false;
  const managedRoot = cfg.controllerRoot || cfg.installRoot;
  if (!managedRoot || typeof managedRoot !== 'string') return false;
  const managed = path.resolve(managedRoot);
  const cwd = path.resolve(invocationCwd);
  return cwd === managed || cwd.startsWith(`${managed}${path.sep}`);
}

function isSelfRunDisallowed(invocationCwd, packageRoot) {
  const root = path.resolve(packageRoot);
  // BUG-154: Only block if the running package is literally named 'MBO' (case-insensitive)
  if (path.basename(root).toLowerCase() !== 'mbo') return false;

  const cwd = path.resolve(invocationCwd);
  return cwd === root || cwd.startsWith(`${root}${path.sep}`);
}

function selfRunGuardMessage(packageRoot) {
  return (
    '[MBO] BLOCKED: Runtime/init cannot execute from the MBO controller/install project.\n' +
    `[MBO] Controller: ${path.resolve(packageRoot)}\n` +
    '[MBO] [RECOMMENDED ACTION]: Launch from a separate target project directory (e.g. MBO_Alpha).\n'
  );
}

module.exports = {
  isSelfRunDisallowed,
  selfRunGuardMessage,
  isManagedControllerInstall,
};
