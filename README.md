# Wayfarer

A persistent, cross-platform background download manager built with Bun,
TypeScript, SQLite and [Gambrel](https://github.com/thenolle/gambrel).

Wayfarer runs as a headless service. It keeps downloading when no browser tab
is open, remembers its work across restarts, and resumes interrupted
transfers.

## Status

Wayfarer is in pre-release. It is usable, but interfaces, configuration and
behaviour may still change before a stable release.

Available today:

- Environment-based configuration with secure defaults.
- A download state machine and a SQLite schema (WAL mode, foreign keys,
  versioned migrations).
- A download engine with parallel byte-range segments, single-stream
  fallback, retries with backoff, ETag and Last-Modified validation, optional
  SHA-256 verification and no-overwrite finalisation.
- A priority scheduler with download and segment concurrency limits, pause,
  resume, cancel and remove, and a global bandwidth limiter.
- URL resolvers for direct links, Buzzheavier and MediaFire, with a registry
  for adding more.
- Torrents: magnet links, `.torrent` links and `.torrent` files, downloaded
  through [aria2](https://aria2.github.io/) with the same queue, priorities,
  pause, resume and save locations as every other download. See
  [docs/guides/torrents.md](docs/guides/torrents.md).
- Network safety: private and reserved addresses are refused by default, and
  every redirect is checked.
- Crash recovery and graceful shutdown that keep progress consistent with the
  files on disk.
- A JSON REST API with bearer-token authentication. See
  [docs/api/rest.md](docs/api/rest.md).
- A server-rendered dashboard built with Gambrel components and icons. It
  works without JavaScript and offers link checks that show the file name
  before you add it, named save locations, search, sorting, bulk actions,
  batch adding, speed presets, a detail panel, dark mode, keyboard shortcuts,
  live updates over WebSockets and, on a local install, "Show in folder". See
  [docs/architecture/dashboard.md](docs/architecture/dashboard.md).
- Deployment configurations for Docker, systemd, Windows Task Scheduler and
  macOS launchd. Only the Docker setup is built and health-checked in CI.

### Known limitations

- Hosts that put a CAPTCHA or Cloudflare challenge in front of a download,
  such as the free tier of DataNodes and some Buzzheavier pages, cannot be
  downloaded from automatically. Wayfarer never solves or bypasses those. Start
  the download in your browser and add the final link instead.
- Hostname checks happen before each request, but the HTTP client resolves
  names again when it connects, so DNS rebinding is not fully prevented. See
  [SECURITY.md](SECURITY.md).
- Torrents are not seeded, BitTorrent v2-only torrents are not supported, and
  peer connections are not covered by the network policy. See
  [docs/guides/torrents.md](docs/guides/torrents.md).

## Requirements

- Bun 1.4.4 or newer.
- Git.
- aria2 (`aria2c`), only for torrents. The Docker image includes it.

## Getting started

```bash
git clone https://github.com/thenolle/wayfarer.git
cd wayfarer
bun install
bun run check
```

`bun run check` regenerates the route manifests, runs the strict TypeScript check and the tests, and builds the project.

### Running the dashboard

```bash
bun run build      # builds the browser bundle into dist/
bun run start      # serves http://127.0.0.1:8787
bun run dev        # development mode with restarts
```

Open <http://127.0.0.1:8787>. Set `WAYFARER_AUTH_TOKEN` (16 or more characters)
before exposing the service beyond the local machine.

## Deployment

| Platform                  | Guide                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| Docker and Docker Compose | [docs/deployment/docker.md](docs/deployment/docker.md)               |
| Linux (systemd)           | [docs/deployment/linux.md](docs/deployment/linux.md)                 |
| Windows (Task Scheduler)  | [docs/deployment/windows.md](docs/deployment/windows.md)             |
| macOS (launchd)           | [docs/deployment/macos.md](docs/deployment/macos.md)                 |
| Reverse proxy and TLS     | [docs/deployment/reverse-proxy.md](docs/deployment/reverse-proxy.md) |
| Operations                | [docs/deployment/operations.md](docs/deployment/operations.md)       |

The Docker setup is built and health-checked in CI. The other configurations
have been syntax-checked but not run on every platform.

## Configuration

All settings are environment variables. Defaults are chosen to be safe.

| Variable                               | Default                      | Description                                                                                                                                                                                    |
| -------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WAYFARER_HOST`                        | `127.0.0.1`                  | Bind address. Non-loopback addresses require an auth token.                                                                                                                                    |
| `WAYFARER_PORT`                        | `8787`                       | Listening port.                                                                                                                                                                                |
| `WAYFARER_AUTH_TOKEN`                  | unset                        | Shared secret. Required (16+ characters) for non-loopback hosts.                                                                                                                               |
| `WAYFARER_ALLOWED_HOSTS`               | empty                        | Extra `Host` names (without ports) the API answers to. Required for `0.0.0.0` and `::`.                                                                                                        |
| `WAYFARER_DATA_DIRECTORY`              | `./data`                     | Database and state directory.                                                                                                                                                                  |
| `WAYFARER_DOWNLOAD_DIRECTORY`          | `<data directory>/downloads` | Destination for completed files.                                                                                                                                                               |
| `WAYFARER_CLIENT_DIRECTORY`            | auto-detected                | Directory of the built browser assets. By default Wayfarer looks next to the built server (`dist/client`), then in `dist/client` of a source checkout, then under the working directory.       |
| `WAYFARER_MAX_SEGMENTS`                | `8`                          | Parallel segments per download (1–64).                                                                                                                                                         |
| `WAYFARER_MAX_CONCURRENT_DOWNLOADS`    | `3`                          | Downloads running at once (1–64).                                                                                                                                                              |
| `WAYFARER_MAX_CONCURRENT_SEGMENTS`     | `16`                         | Segments running at once across all downloads (1–256).                                                                                                                                         |
| `WAYFARER_BANDWIDTH_LIMIT`             | `0`                          | Global limit in bytes per second. `0` means unlimited.                                                                                                                                         |
| `WAYFARER_RETRY_MAX_ATTEMPTS`          | `5`                          | Attempts before a transient failure becomes permanent.                                                                                                                                         |
| `WAYFARER_RETRY_BASE_DELAY_MS`         | `500`                        | Initial backoff delay.                                                                                                                                                                         |
| `WAYFARER_RETRY_MAX_DELAY_MS`          | `30000`                      | Backoff ceiling.                                                                                                                                                                               |
| `WAYFARER_RETRY_JITTER`                | `0.2`                        | Random jitter ratio, 0 to 1.                                                                                                                                                                   |
| `WAYFARER_REQUEST_TIMEOUT_MS`          | `30000`                      | Per-request timeout.                                                                                                                                                                           |
| `WAYFARER_PERSIST_INTERVAL_MS`         | `250`                        | Progress batching interval for SQLite writes.                                                                                                                                                  |
| `WAYFARER_ALLOW_PRIVATE_NETWORKS`      | empty                        | Comma-separated trusted private hosts or ranges.                                                                                                                                               |
| `WAYFARER_LOCATIONS`                   | none                         | Extra save locations as `Name=/absolute/path`, comma separated, for example `Games=D:\Games,Movies=E:\Movies`. The dashboard offers them in "Save to". In Docker, mount each path as a volume. |
| `WAYFARER_ARIA2_PATH`                  | `aria2c`                     | The aria2 program used for torrents.                                                                                                                                                           |
| `WAYFARER_TORRENT_MAX_PEERS`           | `100`                        | Peers per torrent (1–1000).                                                                                                                                                                    |
| `WAYFARER_TORRENT_TRACKERS`            | empty                        | Extra trackers, comma separated.                                                                                                                                                               |
| `WAYFARER_TORRENT_LISTEN_PORT`         | aria2 default                | Port or range for incoming peers.                                                                                                                                                              |
| `WAYFARER_TORRENT_METADATA_TIMEOUT_MS` | `120000`                     | How long a magnet link may wait for its details.                                                                                                                                               |

## Architecture

See [docs/architecture/overview.md](docs/architecture/overview.md).

## Documentation

The documentation lives in [docs/](docs) and is published as a website at
<https://thenolle.github.io/wayfarer/> whenever `docs/` or `website/` change on
`master`. To preview it while you write:

```bash
cd website
bun install
bun run dev   # http://localhost:4321, reads ../docs on every request
```

Add a page by creating a Markdown file in `docs/` and listing it in
`docs/nav.json`.

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
