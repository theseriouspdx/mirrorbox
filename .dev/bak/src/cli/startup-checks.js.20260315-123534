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

function isSelfRunDisallowed(invocationCwd, packageRoot) {
  // setup can run anywhere; this check is for runtime/init only.
  const nearestPkgDir = findNearestPackageDir(invocationCwd);
  if (!nearestPkgDir) return false;

  const pkgName = readPackageName(nearestPkgDir);
  if (pkgName !== 'mbo') return false;

  // If user is in the installed package/controller tree, block.
  const root = path.resolve(packageRoot);
  const cwd = path.resolve(invocationCwd);
  return cwd === root || cwd.startsWith(`${root}${path.sep}`);
}

function selfRunGuardMessage(packageRoot) {
  return (
    '[MBO] BLOCKED: Runtime/init cannot execute from the MBO controller/install project.\n' +
    `[MBO] Controller: ${path.resolve(packageRoot)}\n` +
    '[MBO] Launch from a separate target project directory (e.g. MBO_Alpha).\n'
  );
}

module.exports = {
  isSelfRunDisallowed,
  selfRunGuardMessage,
};
