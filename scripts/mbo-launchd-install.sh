#!/usr/bin/env bash
# MBO launchd Install/Uninstall — registers com.mbo.mcp as a macOS LaunchAgent
# Usage: bash scripts/mbo-launchd-install.sh [install|uninstall|status]
set -euo pipefail

PLIST_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/com.mbo.mcp.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.mbo.mcp.plist"
LABEL="com.mbo.mcp"

case "${1:-install}" in
  install)
    echo "[launchd] Installing $LABEL..."
    cp "$PLIST_SRC" "$PLIST_DEST"
    # Unload first if already registered (idempotent)
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    launchctl load -w "$PLIST_DEST"
    echo "[launchd] $LABEL loaded. MCP server will start now and on login."
    echo "[launchd] Logs: .dev/logs/mcp.out / .dev/logs/mcp.err"
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
