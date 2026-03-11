#!/usr/bin/env bash
# MBO launchd Install/Uninstall — registers com.mbo.mcp as a macOS LaunchAgent
# Usage: bash scripts/mbo-launchd-install.sh [install|uninstall|status]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MBO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/com.mbo.mcp.plist.template"
GENERATED="$SCRIPT_DIR/com.mbo.mcp.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.mbo.mcp.plist"
LABEL="com.mbo.mcp"

_generate_plist() {
  # Resolve the active node bin directory (nvm or system)
  if command -v node >/dev/null 2>&1; then
    NVM_NODE_BIN="$(dirname "$(command -v node)")"
  elif [ -d "$HOME/.nvm" ]; then
    # nvm not sourced yet — find the default node
    NVM_NODE_BIN="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name "bin" -type d 2>/dev/null | sort -V | tail -1)"
  else
    NVM_NODE_BIN="/usr/local/bin"
  fi

  sed \
    -e "s|%%MBO_ROOT%%|$MBO_ROOT|g" \
    -e "s|%%HOME%%|$HOME|g" \
    -e "s|%%NVM_NODE_BIN%%|$NVM_NODE_BIN|g" \
    "$TEMPLATE" > "$GENERATED"

  echo "[launchd] Generated $GENERATED (node: $NVM_NODE_BIN)"
}

case "${1:-install}" in
  install)
    echo "[launchd] Installing $LABEL..."
    _generate_plist
    mkdir -p "$HOME/Library/LaunchAgents"
    cp "$GENERATED" "$PLIST_DEST"
    # Unload first if already registered (idempotent)
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    launchctl load -w "$PLIST_DEST"
    echo "[launchd] $LABEL loaded. MCP server will start now and on login."
    echo "[launchd] Logs: $MBO_ROOT/.dev/logs/mcp.out / mcp.err"
    ;;
  uninstall)
    echo "[launchd] Uninstalling $LABEL..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    rm -f "$PLIST_DEST"
    echo "[launchd] $LABEL unloaded and removed."
    ;;
  status)
    launchctl list | grep "$LABEL" || echo "[launchd] $LABEL not loaded."
    ;;
  *)
    echo "Usage: $0 [install|uninstall|status]"
    exit 1
    ;;
esac
