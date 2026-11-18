# Operations

## Health

`GET /api/health` returns `{"data":{"status":"ok"}}` and needs no token. Docker
uses it for its health check.

## Logs

Wayfarer writes plain lines to standard output and standard error:
`[wayfarer] listening on ...` at start, `received SIGTERM, shutting down` and
`shutdown complete` when stopping, and an error line for each unexpected failure.
Find them with `docker compose logs`, `journalctl -u wayfarer`, or the log file
configured for launchd.

## Stopping and crashes

On `SIGINT` or `SIGTERM` Wayfarer stops accepting downloads, aborts running
transfers, flushes files to disk, stores each segment's confirmed offset, checkpoints
the SQLite log and exits (code 0). If shutdown takes more than 30 seconds it exits
with code 1; progress already stored remains valid.

After a crash or forced stop, the next start compares stored progress with the
files on disk: consistent downloads resume, inconsistent ones restart from zero.
This is safe to repeat.

## Backups

Everything the service owns is in the data directory: `wayfarer.sqlite` (with
`wayfarer.sqlite-wal` while running) and the downloads folder. For a consistent
copy, stop the service first, or use SQLite's own backup tools on the database.

## Upgrades

Stop the service, replace the application files (or rebuild the image), and
start it again. Database migrations run automatically at start. A database
written by a newer version is refused rather than downgraded.

## Resource use

- `WAYFARER_MAX_CONCURRENT_DOWNLOADS` and `WAYFARER_MAX_CONCURRENT_SEGMENTS`
  limit how many connections run at once.
- `WAYFARER_BANDWIDTH_LIMIT`, or the dashboard, limits total speed.
- Sessions (up to 1000) and live-update clients (up to 32) are kept in memory.

## Troubleshooting

| Symptom                                               | Likely cause                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The service exits at start with "configuration error" | A required variable is missing; the message names it.                                                     |
| Pages answer `421`                                    | The `Host` is not in `WAYFARER_ALLOWED_HOSTS`.                                                            |
| Sign-in loops back to the sign-in page                | Cookies are blocked, or the proxy does not forward `Host`.                                                |
| No live progress                                      | The proxy does not pass WebSocket upgrades on `/ws`.                                                      |
| A download fails with `blocked_destination`           | The address is private or reserved; allow it with `WAYFARER_ALLOW_PRIVATE_NETWORKS` only if you trust it. |
