#!/usr/bin/env bash
set -euo pipefail

REPO='https://github.com/thenolle/wayfarer.git'
MINIMUM_BUN='1.4.4'
PORT="${WAYFARER_INSTALL_PORT:-8787}"
REF="${WAYFARER_INSTALL_REF:-}"
OS="$(uname -s)"
LABEL='com.thenolle.wayfarer'

case "$OS" in
  Linux) INSTALL_DIR="${WAYFARER_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/wayfarer}" ;;
  Darwin) INSTALL_DIR="${WAYFARER_INSTALL_DIR:-$HOME/Library/Application Support/Wayfarer}" ;;
  *) echo 'This installer supports Linux and macOS. On Windows use install.ps1.' >&2; exit 1 ;;
esac

DOWNLOAD_DIR="${WAYFARER_DOWNLOAD_DIR:-$HOME/Downloads/Wayfarer}"
APP_DIR="$INSTALL_DIR/app"
DATA_DIR="$INSTALL_DIR/data"
ENV_FILE="$INSTALL_DIR/wayfarer.env"
RUN_SCRIPT="$INSTALL_DIR/run.sh"
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

step() { printf '==> %s\n' "$1"; }
fail() { printf 'Error: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

install_packages() {
  if have apt-get; then sudo apt-get update -qq && sudo apt-get install -y "$@"
  elif have dnf; then sudo dnf install -y "$@"
  elif have pacman; then sudo pacman -S --needed --noconfirm "$@"
  elif have zypper; then sudo zypper --non-interactive install "$@"
  else fail "Install these packages and run this again: $*"
  fi
}

ensure_tool() {
  have "$1" && return 0
  step "Installing $1"
  if [ "$OS" = Darwin ]; then
    have brew || fail 'Homebrew is required on macOS: https://brew.sh'
    brew install "${2:-$1}"
  else
    install_packages "${2:-$1}"
  fi
}

ensure_bun() {
  if ! have bun; then
    step 'Installing bun'
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
  local current
  current="$(bun --version | cut -d- -f1)"
  if [ "$(printf '%s\n%s\n' "$MINIMUM_BUN" "$current" | sort -V | head -n1)" != "$MINIMUM_BUN" ]; then
    step "Upgrading bun from $current"
    bun upgrade
    current="$(bun --version | cut -d- -f1)"
    [ "$(printf '%s\n%s\n' "$MINIMUM_BUN" "$current" | sort -V | head -n1)" = "$MINIMUM_BUN" ] || fail "Bun $MINIMUM_BUN or newer is required, found $current."
  fi
}

latest_ref() {
  local tag
  tag="$(git ls-remote --tags --refs "$REPO" 'v*' | sed -n 's#.*refs/tags/\(v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$#\1#p' | sort -V | tail -n1)"
  echo "${tag:-master}"
}

stop_service() {
  if [ "$OS" = Darwin ]; then
    launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  elif have systemctl; then
    systemctl --user stop wayfarer.service >/dev/null 2>&1 || true
  fi
}

wait_healthy() {
  local attempt
  for attempt in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

find_browser() {
  local candidate
  if [ "$OS" = Darwin ]; then
    for candidate in 'Google Chrome' 'Microsoft Edge' 'Brave Browser' 'Chromium'; do
      if [ -d "/Applications/$candidate.app" ] || [ -d "$HOME/Applications/$candidate.app" ]; then echo "$candidate"; return 0; fi
    done
  else
    for candidate in google-chrome google-chrome-stable microsoft-edge brave-browser chromium chromium-browser vivaldi; do
      if have "$candidate"; then command -v "$candidate"; return 0; fi
    done
  fi
  return 1
}

install_service_linux() {
  have systemctl || { echo "systemd was not found. Start Wayfarer with: bash \"$RUN_SCRIPT\""; return 0; }
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/wayfarer.service" <<EOF
[Unit]
Description=Wayfarer download manager
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/env bash "$RUN_SCRIPT"
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=35

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now wayfarer.service
  loginctl enable-linger "$USER" >/dev/null 2>&1 || echo 'Tip: run "sudo loginctl enable-linger $USER" to keep Wayfarer running when you are logged out.'
}

install_service_macos() {
  mkdir -p "$HOME/Library/LaunchAgents" "$INSTALL_DIR/logs"
  cat > "$HOME/Library/LaunchAgents/$LABEL.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUN_SCRIPT</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$INSTALL_DIR/logs/wayfarer.log</string>
  <key>StandardErrorPath</key><string>$INSTALL_DIR/logs/wayfarer.log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist"
  launchctl kickstart -k "gui/$(id -u)/$LABEL"
}

create_shortcut_linux() {
  local browser exec_line icon_dir
  icon_dir="$HOME/.local/share/icons/hicolor/512x512/apps"
  mkdir -p "$icon_dir" "$HOME/.local/share/applications"
  curl -fsS "http://127.0.0.1:$PORT/icon-512.png" -o "$icon_dir/wayfarer.png"
  if browser="$(find_browser)"; then exec_line="\"$browser\" --app=http://127.0.0.1:$PORT/"; else exec_line="xdg-open http://127.0.0.1:$PORT/"; fi
  cat > "$HOME/.local/share/applications/wayfarer.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Wayfarer
Comment=Background download manager
Exec=$exec_line
Icon=$icon_dir/wayfarer.png
Terminal=false
Categories=Network;FileTransfer;
EOF
  chmod +x "$HOME/.local/share/applications/wayfarer.desktop"
  if [ -d "$HOME/Desktop" ]; then
    cp "$HOME/.local/share/applications/wayfarer.desktop" "$HOME/Desktop/Wayfarer.desktop"
    chmod +x "$HOME/Desktop/Wayfarer.desktop"
    have gio && gio set "$HOME/Desktop/Wayfarer.desktop" metadata::trusted true >/dev/null 2>&1 || true
  fi
  have update-desktop-database && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
}

create_shortcut_macos() {
  local bundle="$HOME/Applications/Wayfarer.app" iconset png browser size
  png="$INSTALL_DIR/wayfarer.png"
  curl -fsS "http://127.0.0.1:$PORT/icon-512.png" -o "$png"
  rm -rf "$bundle"
  mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
  cat > "$bundle/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Wayfarer</string>
  <key>CFBundleExecutable</key><string>Wayfarer</string>
  <key>CFBundleIdentifier</key><string>$LABEL.launcher</string>
  <key>CFBundleIconFile</key><string>Wayfarer</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
</dict>
</plist>
EOF
  if browser="$(find_browser)"; then
    printf '#!/bin/bash\nexec open -na "%s" --args --app="http://127.0.0.1:%s/"\n' "$browser" "$PORT" > "$bundle/Contents/MacOS/Wayfarer"
  else
    printf '#!/bin/bash\nexec open "http://127.0.0.1:%s/"\n' "$PORT" > "$bundle/Contents/MacOS/Wayfarer"
  fi
  chmod +x "$bundle/Contents/MacOS/Wayfarer"
  iconset="$(mktemp -d)/Wayfarer.iconset"
  mkdir -p "$iconset"
  for size in 16 32 64 128 256 512; do
    sips -z "$size" "$size" "$png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
    sips -z "$((size * 2))" "$((size * 2))" "$png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$iconset" -o "$bundle/Contents/Resources/Wayfarer.icns" || echo 'The icon could not be created; the app works without it.'
  [ -d "$HOME/Desktop" ] && ln -sfn "$bundle" "$HOME/Desktop/Wayfarer" || true
}

step 'Checking requirements'
have curl || ensure_tool curl
ensure_tool git
[ "$OS" = Linux ] && ensure_tool unzip
ensure_tool aria2c aria2
ensure_bun

mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$DOWNLOAD_DIR"
if [ -f "$ENV_FILE" ]; then
  existing="$(sed -n 's/^WAYFARER_PORT="\{0,1\}\([0-9][0-9]*\)"\{0,1\}$/\1/p' "$ENV_FILE" | head -n1)"
  [ -n "$existing" ] && PORT="$existing"
fi

stop_service
[ -n "$REF" ] || REF="$(latest_ref)"
step "Getting Wayfarer $REF"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --tags --force --quiet origin
else
  git clone --quiet "$REPO" "$APP_DIR"
fi
if [ "$REF" = master ]; then TARGET='origin/master'; else TARGET="$REF"; fi
git -C "$APP_DIR" checkout --force --quiet "$TARGET"

step 'Building'
(cd "$APP_DIR" && bun install --frozen-lockfile && bun run build)

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
WAYFARER_HOST="127.0.0.1"
WAYFARER_PORT="$PORT"
WAYFARER_DATA_DIRECTORY="$DATA_DIR"
WAYFARER_DOWNLOAD_DIRECTORY="$DOWNLOAD_DIR"
WAYFARER_ARIA2_PATH="$(command -v aria2c)"
EOF
fi

cat > "$RUN_SCRIPT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
set -a
. "$HERE/wayfarer.env"
set +a
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$HERE/app"
exec bun dist/server/index.js
EOF
chmod +x "$RUN_SCRIPT"

step 'Registering the Wayfarer service'
if [ "$OS" = Darwin ]; then install_service_macos; else install_service_linux; fi

step 'Waiting for Wayfarer to start'
wait_healthy || fail "Wayfarer did not answer on port $PORT. Run: bash \"$RUN_SCRIPT\" to see why."

if [ "${WAYFARER_INSTALL_NO_SHORTCUT:-}" != 1 ]; then
  step 'Creating the shortcut'
  if [ "$OS" = Darwin ]; then create_shortcut_macos; else create_shortcut_linux; fi
fi

printf '\nWayfarer is running at http://127.0.0.1:%s/\nDownloads go to %s. Settings: %s\n' "$PORT" "$DOWNLOAD_DIR" "$ENV_FILE"
