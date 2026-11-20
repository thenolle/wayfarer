#!/usr/bin/env bash
set -euo pipefail

OS="$(uname -s)"
LABEL='com.thenolle.wayfarer'
case "$OS" in
  Linux) INSTALL_DIR="${WAYFARER_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/wayfarer}" ;;
  Darwin) INSTALL_DIR="${WAYFARER_INSTALL_DIR:-$HOME/Library/Application Support/Wayfarer}" ;;
  *) echo 'This script supports Linux and macOS.' >&2; exit 1 ;;
esac

if [ "$OS" = Darwin ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
  rm -rf "$HOME/Applications/Wayfarer.app" "$HOME/Desktop/Wayfarer"
else
  systemctl --user disable --now wayfarer.service >/dev/null 2>&1 || true
  rm -f "$HOME/.config/systemd/user/wayfarer.service" "$HOME/.local/share/applications/wayfarer.desktop" "$HOME/Desktop/Wayfarer.desktop" "$HOME/.local/share/icons/hicolor/512x512/apps/wayfarer.png"
  systemctl --user daemon-reload >/dev/null 2>&1 || true
fi

if [ "${1:-}" = '--purge' ]; then
  rm -rf "$INSTALL_DIR"
  echo 'Removed Wayfarer, its settings and its database. Downloaded files were not touched.'
else
  rm -rf "$INSTALL_DIR/app"
  rm -f "$INSTALL_DIR/wayfarer.png" "$INSTALL_DIR/run.sh"
  echo "Removed Wayfarer. Settings and the database stay in $INSTALL_DIR. Use --purge to remove them too."
fi
