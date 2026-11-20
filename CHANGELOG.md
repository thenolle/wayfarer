# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-11-21

### Added
- Torrents: magnet links, `.torrent` links and `.torrent` files, downloaded
  through [aria2](https://aria2.github.io/) with the same queue, priorities,
  pause, resume, cancel, save locations and webhooks as other downloads.
  Files can be added from the dashboard form or `POST /api/downloads/torrent`.
  Torrents are detected as duplicates by their info hash.
- Settings for torrents: `WAYFARER_ARIA2_PATH`, `WAYFARER_TORRENT_MAX_PEERS`,
  `WAYFARER_TORRENT_TRACKERS`, `WAYFARER_TORRENT_LISTEN_PORT` and
  `WAYFARER_TORRENT_METADATA_TIMEOUT_MS`.
- One-click installers for Windows (PowerShell), Linux and macOS. They install
  git, Bun and aria2 when missing, build Wayfarer, start it with your session
  in the background and add a shortcut that opens the dashboard as an app.
- The dashboard is an installable web app, with a manifest, a service worker
  and generated icons.

### Changed
- The Docker image includes aria2.
- Deleting a completed download's files removes folders too, because a
  multi-file torrent is saved as a folder. This stays inside your save
  locations.

### Known limitations
- Torrents are tested with a simulated aria2 only, not against a live swarm.
- Torrents are not seeded, BitTorrent v2-only torrents are not supported, and
  peer connections are not covered by the network policy.
- The Windows installer was tested by hand. The Linux and macOS installers have
  not been run.

## [0.1.2] - 2026-11-19

### Added
- Whole-queue actions: pause all, resume all, retry failed, clear finished
  and clear failed, in the dashboard and at `POST /api/queue/:operation`.
- `GET /api/stats` and Prometheus-format `GET /api/metrics`.
- Signed webhooks for completed and failed downloads (`WAYFARER_WEBHOOK_URL`,
  `WAYFARER_WEBHOOK_SECRET`).
- Automatic cleanup of old finished entries (`WAYFARER_RETENTION_DAYS`).
- Export and import of the downloads list, in the dashboard and at `/api/export`
  and `/api/import`.
- Resolvers for GitHub file pages, public Google Drive files and personal OneDrive
  links (simulated-response tests only).

### Fixed
- Links from resolver hosts that answer with a web page, such as a quota page or
  an expired link, now fail with a clear message instead of being saved as a file.
- The scheduler is started once.

## [0.1.1] - 2026-11-19

### Added
- Save locations can be added, renamed, moved and removed from the dashboard
  (`/locations`) and the REST API (`/api/locations`) without restarting.
  Locations from `WAYFARER_LOCATIONS` stay fixed, and a location that holds
  downloads cannot be moved or removed.
- Resolvers for Dropbox shared files, Pixeldrain file pages and Hugging Face
  repository files (tested with simulated responses only).
- Links that are already in the downloads list, or were already downloaded, are
  skipped with a clear message. Use "Add even if the link is already in the
  list" in the dashboard, or `"allowDuplicate": true` in the API, to add them
  again. The API answers `409 duplicate`.
- A documentation website with search, dark mode and offline support, built
  from `docs/` and published to GitHub Pages on every change to `docs/` or
  `website/`.

### Changed
- The documentation was rewritten and expanded: getting started, configuration
  reference, dashboard guide, supported hosts, troubleshooting and the
  security model.
- Pull request titles must follow Conventional Commits.

## [0.1.0] - 2026-11-18

### Added
- Download engine with segmented transfers, resume, retries, checksums and
  crash recovery.
- Priority scheduler, bandwidth limiter, REST API and WebSocket live updates.
- Server-rendered dashboard with link checks, named save locations, search,
  bulk actions and dark mode.
- Resolvers for direct links, Buzzheavier and MediaFire, and a clear message
  for CAPTCHA-protected hosts.
- Docker, systemd, Windows and macOS deployment configurations.

[0.2.0]: https://github.com/thenolle/wayfarer/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/thenolle/wayfarer/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/thenolle/wayfarer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/thenolle/wayfarer/releases/tag/v0.1.0
