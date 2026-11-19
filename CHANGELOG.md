# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - Unreleased

### Added
- Links that are already in the downloads list, or were already downloaded, are skipped with a clear message. Use "Add even if the link is already in the list" in the dashboard, or `"allowDuplicate": true` in the API, to add them again.
- Dropbox, Pixeldrain and Hugging Face resolvers (tested with simulated responses only).

 - Save locations can be added, renamed, moved and removed from the dashboard (`/locations`) and the REST API (`/api/locations`) without restarting. Locations from `WAYFARER_LOCATIONS` stay fixed.
- Download engine with segmented transfers, resume, retries, checksums and
  crash recovery.
- Priority scheduler, bandwidth limiter, REST API and WebSocket live updates.
- Server-rendered dashboard with link checks, named save locations, search,
  bulk actions and dark mode.
- Resolvers for direct links, Buzzheavier and MediaFire, and a clear message
  for CAPTCHA-protected hosts.
- Docker, systemd, Windows and macOS deployment configurations.
