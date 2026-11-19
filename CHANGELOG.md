# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[0.1.1]: https://github.com/thenolle/wayfarer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/thenolle/wayfarer/releases/tag/v0.1.0
