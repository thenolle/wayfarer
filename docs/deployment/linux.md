# Linux (systemd)

These steps assume Bun is installed system-wide at `/usr/local/bin/bun`. Check
with `which bun` and adjust `ExecStart` in the unit file if yours differs.

> Prefer the [one-click installer](../guides/installer.md). It registers a sign-in task for you, without administrator rights.

```bash
sudo useradd --system --home-dir /var/lib/wayfarer --shell /usr/sbin/nologin wayfarer

bun install --frozen-lockfile
bun run build

sudo install -d /opt/wayfarer
sudo cp -r dist package.json bun.lock /opt/wayfarer/
(cd /opt/wayfarer && sudo bun install --frozen-lockfile --production)

sudo install -d -m 755 /etc/wayfarer
sudo install -m 600 deployment/systemd/wayfarer.env.example /etc/wayfarer/wayfarer.env
sudo install -m 644 deployment/systemd/wayfarer.service /etc/systemd/system/wayfarer.service

sudoedit /etc/wayfarer/wayfarer.env
sudo systemctl daemon-reload
sudo systemctl enable --now wayfarer
```

Follow the logs with `journalctl -u wayfarer -f`.

- State is stored in `/var/lib/wayfarer` (created and owned by the service user
  through `StateDirectory`). To store downloads elsewhere, set
  `WAYFARER_DOWNLOAD_DIR` and add `ReadWritePaths=<that directory>` to the unit.
- `systemctl stop wayfarer` sends `SIGTERM` and waits up to 40 seconds for a
  clean shutdown.
- The environment file is readable by root only, so the access token is not
  exposed to other users.
- The unit applies systemd's sandboxing options. They have not been tested on
  every distribution; if the service fails to start, `journalctl` will name the
  restriction at fault.
