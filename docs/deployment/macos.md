# macOS (launchd)

This sets up a per-user launch agent: it starts when you log in and restarts if
the process fails.

```bash
bun install --frozen-lockfile
bun run build

INSTALL_DIR="$HOME/wayfarer"
DATA_DIR="$HOME/wayfarer-data"
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$HOME/Library/LaunchAgents"
cp -R dist package.json bun.lock "$INSTALL_DIR/"
(cd "$INSTALL_DIR" && bun install --frozen-lockfile --production)

sed -e "s|__BUN_PATH__|$(command -v bun)|" \
    -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    -e "s|__DATA_DIR__|$DATA_DIR|g" \
    deployment/macos/com.thenolle.wayfarer.plist \
    > "$HOME/Library/LaunchAgents/com.thenolle.wayfarer.plist"

launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.thenolle.wayfarer.plist"
```

- Logs go to `~/wayfarer-data/wayfarer.log`.
- Restart: `launchctl kickstart -k "gui/$(id -u)/com.thenolle.wayfarer"`.
- Stop and unload: `launchctl bootout "gui/$(id -u)/com.thenolle.wayfarer"`.
  launchd sends `SIGTERM` and waits 40 seconds (`ExitTimeOut`) before killing the
  process.
- On loopback no access token is needed. To expose the service, add
  `WAYFARER_HOST`, `WAYFARER_AUTH_TOKEN` and `WAYFARER_ALLOWED_HOSTS` to the
  `EnvironmentVariables` dictionary.
- A launch agent runs while you are logged in. Running before login needs a
  launch daemon in `/Library/LaunchDaemons`, which this repository does not
  provide.
- The plist has been syntax-checked but not run on a Mac.
