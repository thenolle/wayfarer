# Windows

Wayfarer runs on Windows as a scheduled task that starts at boot. Windows
services need a program that speaks the service protocol, which Bun does not,
so Task Scheduler is the native mechanism used here.

> Prefer the [one-click installer](../guides/installer.md). It registers a sign-in task for you, without administrator rights.

## Install

1. Install [Bun](https://bun.sh/) and make sure `bun` is on the `PATH`.
2. Build the application in the install directory, for example `C:\wayfarer`:

   ```powershell
   bun install --frozen-lockfile
   bun run build
   ```

3. Create `C:\wayfarer\wayfarer.env` from `deployment\windows\wayfarer.env.example`
   and edit it. Lines are `NAME=value`; lines starting with `#` are ignored.
4. From an elevated PowerShell:

   ```powershell
   .\deployment\windows\install-task.ps1 -InstallDir C:\wayfarer
   Start-ScheduledTask -TaskName Wayfarer
   ```

The task runs as the current user (or `-UserName`), whether or not anyone is
signed in, without storing a password. It restarts up to five times, one minute
apart, if the process fails. Remove it with `deployment\windows\uninstall-task.ps1`.

## Stopping

Windows does not deliver `SIGTERM`. Stopping the task (`Stop-ScheduledTask`)
ends the process immediately, like a crash. Wayfarer is built for that: on the
next start it reconciles progress with the files on disk and resumes. A run in
a console shuts down cleanly on Ctrl+C or Ctrl+Break.

## Notes

- Use absolute Windows paths in `wayfarer.env`, for example
  `WAYFARER_DATA_DIRECTORY=C:\wayfarer\data`.
- These scripts have not been run on every Windows version. Run
  `start-wayfarer.ps1` in a terminal first to see any error directly.
- Third-party service wrappers exist but are not covered or tested here.
