# Configuration

All settings are environment variables. Defaults are chosen to be safe. Wayfarer refuses to start with an invalid or unsafe combination and names the variable in the error.

## Network and access

| Variable                 | Default     | Description                                                             |
| ------------------------ | ----------- | ----------------------------------------------------------------------- |
| `WAYFARER_HOST`          | `127.0.0.1` | Bind address. Non-loopback addresses require an auth token.             |
| `WAYFARER_PORT`          | `8787`      | Listening port (0–65535).                                               |
| `WAYFARER_AUTH_TOKEN`    | unset       | Shared secret, at least 16 characters. Required for non-loopback hosts. |
| `WAYFARER_ALLOWED_HOSTS` | empty       | Extra `Host` names, without ports. Required for `0.0.0.0` and `::`.     |

## Storage

| Variable                      | Default                      | Description                                                                                                                                                                                   |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WAYFARER_DATA_DIRECTORY`     | `./data`                     | Database and state directory.                                                                                                                                                                 |
| `WAYFARER_DOWNLOAD_DIRECTORY` | `<data directory>/downloads` | Main destination for files.                                                                                                                                                                   |
| `WAYFARER_LOCATIONS`          | none                         | Extra save locations as `Name=/absolute/path`, comma separated. Example: `Games=D:\Games,Movies=E:\Movies`. Paths cannot contain commas. These are fixed. More can be added in the dashboard. |
| `WAYFARER_CLIENT_DIRECTORY`   | auto-detected                | Directory of the built browser files.                                                                                                                                                         |

## Performance

| Variable                            | Default | Range    | Description                                            |
| ----------------------------------- | ------- | -------- | ------------------------------------------------------ |
| `WAYFARER_MAX_SEGMENTS`             | `8`     | 1–64     | Parallel segments per download.                        |
| `WAYFARER_MAX_CONCURRENT_DOWNLOADS` | `3`     | 1–64     | Downloads running at once.                             |
| `WAYFARER_MAX_CONCURRENT_SEGMENTS`  | `16`    | 1–256    | Segments running at once across all downloads.         |
| `WAYFARER_BANDWIDTH_LIMIT`          | `0`     | 0 and up | Global limit in bytes per second. `0` means unlimited. |
| `WAYFARER_PERSIST_INTERVAL_MS`      | `250`   | 50–60000 | How often progress is written to SQLite.               |

## Retries and timeouts

| Variable                       | Default | Range        | Description                                                  |
| ------------------------------ | ------- | ------------ | ------------------------------------------------------------ |
| `WAYFARER_RETRY_MAX_ATTEMPTS`  | `5`     | 1–100        | Attempts before a transient failure becomes permanent.       |
| `WAYFARER_RETRY_BASE_DELAY_MS` | `500`   | 1–3600000    | First backoff delay.                                         |
| `WAYFARER_RETRY_MAX_DELAY_MS`  | `30000` | 1–3600000    | Backoff ceiling. It must not be smaller than the base delay. |
| `WAYFARER_RETRY_JITTER`        | `0.2`   | 0–1          | Random share added to each delay.                            |
| `WAYFARER_REQUEST_TIMEOUT_MS`  | `30000` | 1000–3600000 | How long to wait for a server's response headers.            |

## Network safety

| Variable                          | Default | Description                                                                            |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `WAYFARER_ALLOW_PRIVATE_NETWORKS` | empty   | Comma-separated private hosts, IP addresses or IPv4 ranges that downloads may contact. |

> [!WARNING]
> By default downloads can only reach public addresses. Allow a private network only if you trust everything on it.

## Notifications and cleanup

| Variable                  | Default | Description                                                                                                                                           |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WAYFARER_WEBHOOK_URL`    | unset   | `http` or `https` URL that receives a signed `POST` when a download completes or fails. No user name or password. See [Webhooks](guides/webhooks.md). |
| `WAYFARER_WEBHOOK_SECRET` | unset   | At least 16 characters. Signs webhook requests. Needs `WAYFARER_WEBHOOK_URL`.                                                                         |
| `WAYFARER_RETENTION_DAYS` | `0`     | 0–3650. Remove completed and cancelled entries older than this many days from the list. `0` keeps everything. Files are never deleted.                |

## Torrents

| Variable                               | Default       | Description                                                                        |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `WAYFARER_ARIA2_PATH`                  | `aria2c`      | The aria2 program used for torrents. See [Torrents](guides/torrents.md).           |
| `WAYFARER_TORRENT_MAX_PEERS`           | `100`         | Peers per torrent (1–1000).                                                        |
| `WAYFARER_TORRENT_TRACKERS`            | empty         | Extra trackers, comma separated, added to every torrent. `http`, `https` or `udp`. |
| `WAYFARER_TORRENT_LISTEN_PORT`         | aria2 default | Port or range for incoming peers and DHT, for example `6881-6999`.                 |
| `WAYFARER_TORRENT_METADATA_TIMEOUT_MS` | `120000`      | How long a magnet link may wait for its details before it fails (5000–3600000).    |

## Examples

```bash
# Local, defaults
bun run start

# Reachable through a reverse proxy
WAYFARER_HOST=0.0.0.0 \
WAYFARER_AUTH_TOKEN="$(openssl rand -hex 32)" \
WAYFARER_ALLOWED_HOSTS=downloads.example.com \
bun run start
```
