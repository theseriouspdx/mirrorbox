#!/usr/bin/env bash
set -euo pipefail

# End-user style local installer from source checkout.
# Produces a tarball, installs it globally, and stamps controllerRoot to this source path.

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG=""

echo "[mbo-install-local] Source: $SRC_ROOT"

(
  cd "$SRC_ROOT"
  PKG="$(npm pack | tail -n 1)"
  echo "[mbo-install-local] Packed: $PKG"
  npm install -g "$PKG"
)

node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfgPath = path.join(os.homedir(), '.mbo', 'config.json');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
const srcRoot = process.argv[1];
cfg.controllerRoot = srcRoot;
cfg.installRoot = srcRoot;
cfg.updatedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log(`[mbo-install-local] Updated controller root in ${cfgPath} -> ${srcRoot}`);
NODE "$SRC_ROOT"

echo "[mbo-install-local] Done. Run 'mbo' from your target project directory."
