#!/usr/bin/env bash
set -euo pipefail

# Install latest local package into Alpha as an end-user target project.
# This avoids direct node launcher usage.

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALPHA_ROOT="${1:-/Users/johnserious/MBO_Alpha}"

if [[ ! -d "$ALPHA_ROOT" ]]; then
  echo "[mbo-install-alpha] Alpha root not found: $ALPHA_ROOT" >&2
  exit 1
fi

PKG="$(cd "$SRC_ROOT" && npm pack | tail -n 1)"
PKG_PATH="$SRC_ROOT/$PKG"

echo "[mbo-install-alpha] Package: $PKG_PATH"
echo "[mbo-install-alpha] Target:  $ALPHA_ROOT"

cd "$ALPHA_ROOT"
npm install "$PKG_PATH"

echo "[mbo-install-alpha] Installed. Launch with:"
echo "  cd $ALPHA_ROOT && npx mbo"
