# Wayfarer

A persistent, cross-platform background download manager built with Bun,
TypeScript, SQLite and [Gambrel](https://github.com/thenolle/gambrel).

Wayfarer runs as a headless service. It keeps downloading when no browser tab
is open, remembers its work across restarts, and resumes interrupted
transfers.

## Status

Wayfarer is under active development and is not ready for production use.
Interfaces, configuration and behaviour may change before the first release.

Available today:

- Environment-based configuration with secure defaults.
- A download state machine and a SQLite schema (WAL mode, foreign keys,
  versioned migrations).
- A download engine with parallel byte-range segments, single-stream
  fallback, retries with backoff, ETag and Last-Modified validation, optional
  SHA-256 verification and no-overwrite finalisation.
- A priority scheduler with download and segment concurrency limits, pause,
  resume, cancel and remove, and a global bandwidth limiter.
- URL resolvers for direct links and Buzzheavier, with a registry for adding
  more.
- Network safety: private and reserved addresses are refused by default, and
  every redirect is checked.
- Crash recovery and graceful shutdown that keep progress consistent with the
  files on disk.
- A JSON REST API with bearer-token authentication. See
  [docs/api/rest.md](docs/api/rest.md).
- A server-rendered web dashboard (Gambrel) that works without JavaScript, with
  sessions, CSRF protection, dark mode and live updates over WebSockets. See
  [docs/architecture/dashboard.md](docs/architecture/dashboard.md).

Not yet available: Docker, systemd, Windows and macOS service configurations.

## Requirements

- Bun 1.4.4 or newer.
- Git.

## Getting started

```bash
git clone https://github.com/thenolle/wayfarer.git
cd wayfarer
bun install
bun run check
```

`bun run check` runs the strict TypeScript check and the test suite.

### Running the dashboard

```bash
bun run build      # builds the browser bundle into dist/
bun run start      # serves http://127.0.0.1:8787
bun run dev        # development mode with restarts
```

Open <http://127.0.0.1:8787>. Set `WAYFARER_AUTH_TOKEN` (16 or more characters)
before exposing the service beyond the local machine.

## Configuration

All settings are environment variables. Defaults are chosen to be safe.

| Variable                            | Default                      | Description                                                                             |
| ----------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `WAYFARER_HOST`                     | `127.0.0.1`                  | Bind address. Non-loopback addresses require an auth token.                             |
| `WAYFARER_PORT`                     | `8787`                       | Listening port.                                                                         |
| `WAYFARER_AUTH_TOKEN`               | unset                        | Shared secret. Required (16+ characters) for non-loopback hosts.                        |
| `WAYFARER_ALLOWED_HOSTS`            | empty                        | Extra `Host` names (without ports) the API answers to. Required for `0.0.0.0` and `::`. |
| `WAYFARER_DATA_DIRECTORY`           | `./data`                     | Database and state directory.                                                           |
| `WAYFARER_DOWNLOAD_DIRECTORY`       | `<data directory>/downloads` | Destination for completed files.                                                        |
| `WAYFARER_CLIENT_DIRECTORY`         | `dist/client`                | Directory of the built browser assets (`bun run build`).                                |
| `WAYFARER_MAX_SEGMENTS`             | `8`                          | Parallel segments per download (1–64).                                                  |
| `WAYFARER_MAX_CONCURRENT_DOWNLOADS` | `3`                          | Downloads running at once (1–64).                                                       |
| `WAYFARER_MAX_CONCURRENT_SEGMENTS`  | `16`                         | Segments running at once across all downloads (1–256).                                  |
| `WAYFARER_BANDWIDTH_LIMIT`          | `0`                          | Global limit in bytes per second. `0` means unlimited.                                  |
| `WAYFARER_RETRY_MAX_ATTEMPTS`       | `5`                          | Attempts before a transient failure becomes permanent.                                  |
| `WAYFARER_RETRY_BASE_DELAY_MS`      | `500`                        | Initial backoff delay.                                                                  |
| `WAYFARER_RETRY_MAX_DELAY_MS`       | `30000`                      | Backoff ceiling.                                                                        |
| `WAYFARER_RETRY_JITTER`             | `0.2`                        | Random jitter ratio, 0 to 1.                                                            |
| `WAYFARER_REQUEST_TIMEOUT_MS`       | `30000`                      | Per-request timeout.                                                                    |
| `WAYFARER_PERSIST_INTERVAL_MS`      | `250`                        | Progress batching interval for SQLite writes.                                           |
| `WAYFARER_ALLOW_PRIVATE_NETWORKS`   | empty                        | Comma-separated trusted private hosts or ranges.                                        |

## Architecture

See [docs/architecture/overview.md](docs/architecture/overview.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Do not report vulnerabilities through public issues. See
[SECURITY.md](SECURITY.md).

## License

Wayfarer is licensed under the
[PolyForm Strict License 1.0.0](LICENSE) (`PolyForm-Strict-1.0.0`). It is
source-available software, not open-source software.

In plain terms, the license allows you to use Wayfarer for noncommercial
purposes: personal use, hobby projects, research, and use by charitable,
educational, public research, public safety or health, environmental and
government organisations. It does not allow you to distribute copies, modify
the software or create derivative works, and it does not allow commercial use.
A public repository does not grant any additional rights. Read the full
[LICENSE](LICENSE) for the exact terms.

Wayfarer depends on Gambrel, which is also licensed under PolyForm Strict
1.0.0 by the same author.
