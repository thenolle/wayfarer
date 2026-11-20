# One-click installer

The installers set up everything Wayfarer needs for one user, with no administrator rights: git, Bun, aria2, the app itself, an autostart service and a shortcut that opens the dashboard in its own window.

## Install

Windows (PowerShell):

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/thenolle/wayfarer/master/deployment/install/install.ps1)))
```

Linux and macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/thenolle/wayfarer/master/deployment/install/install.sh | bash
```

Read a script before you run it. Both are short and live in `deployment/install/`.

## What it does

1. Installs git, Bun (1.4.4 or newer) and aria2 with `winget`, Homebrew or your package manager, only when they are missing.
2. Downloads the newest release tag, or `master` when there is none, into the install folder, then builds it.
3. Writes `wayfarer.env` once. Your edits are never overwritten on update.
4. Registers an autostart service: a Task Scheduler task at sign-in on Windows, a systemd user service on Linux and a LaunchAgent on macOS.
5. Waits for `/api/health`, then creates the shortcut.

| System  | Install folder                           | Service                             |
| ------- | ---------------------------------------- | ----------------------------------- |
| Windows | `%LOCALAPPDATA%\Wayfarer`                | Task Scheduler task `Wayfarer`      |
| Linux   | `~/.local/share/wayfarer`                | `systemctl --user status wayfarer`  |
| macOS   | `~/Library/Application Support/Wayfarer` | LaunchAgent `com.thenolle.wayfarer` |

Downloads go to `Downloads/Wayfarer` in your home folder. Wayfarer listens on `127.0.0.1:8787`, so no token is needed.

## The shortcut and the app

The shortcut opens `http://127.0.0.1:8787/` in an app window, without tabs or an address bar, using Edge, Chrome, Brave or Chromium. Without one of them it opens your default browser.

The dashboard is also a web app. In a Chromium browser, open it and choose "Install Wayfarer" from the address bar or menu to get a window of its own with the Wayfarer icon.

## Options

Windows: `-Ref v0.2.0`, `-Port 9000`, `-InstallDir`, `-DownloadDir`, `-NoShortcut`. Use the script file with these, for example `.\install.ps1 -Port 9000`.

Linux and macOS use environment variables: `WAYFARER_INSTALL_REF`, `WAYFARER_INSTALL_PORT`, `WAYFARER_INSTALL_DIR`, `WAYFARER_DOWNLOAD_DIR` and `WAYFARER_INSTALL_NO_SHORTCUT=1`.

## Update and uninstall

Run the installer again to update. Settings and the database are kept.

To remove Wayfarer, run `uninstall.ps1` or `uninstall.sh`. Add `-Purge` (Windows) or `--purge` (Linux, macOS) to delete settings and the database too. Downloaded files are never touched.

## Troubleshooting

- **A command was installed but is not found:** open a new terminal and run the installer again.
- **The service does not answer:** run `deployment\windows\start-wayfarer.ps1`, or `bash ~/.local/share/wayfarer/run.sh`, to see the error.
- **Linux stops when you log out:** run `sudo loginctl enable-linger $USER`.
- **macOS asks about the app:** the launcher is unsigned. Open it once from Finder with right click, then Open.
