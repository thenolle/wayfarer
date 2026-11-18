# Getting started

This page takes you from a fresh checkout to your first finished download.

## Requirements

- Bun 1.4.4 or newer.
- Git.

## Install and run

```bash
git clone https://github.com/thenolle/wayfarer.git
cd wayfarer
bun install
bun run build
bun run start
```

`bun run build` creates the browser files in `dist/`. `bun run start` serves the dashboard on <http://127.0.0.1:8787>. For development with restarts, use `bun run dev`.

## Add a download

1. Open the dashboard and paste one or more links, one per line.
2. Wait a moment. Wayfarer checks a single link and shows its file name, size and whether it can resume.
3. Choose a location under **Save to**, or leave the default.
4. Press **Add**.

Downloads continue when you close the tab. When one finishes, press **Download file** on its card.

## Where files and data live

By default everything is under `./data` in the directory you started Wayfarer from: the database is `data/wayfarer.sqlite` and finished files are in `data/downloads`. Change them with `WAYFARER_DATA_DIRECTORY` and `WAYFARER_DOWNLOAD_DIRECTORY`, and add extra save locations with `WAYFARER_LOCATIONS`. See [Configuration](configuration.md).

## Before you expose it

Wayfarer listens on `127.0.0.1` and needs no password there. To reach it from other machines, set `WAYFARER_AUTH_TOKEN` to at least 16 characters, put a [reverse proxy](deployment/reverse-proxy.md) in front and read the [security model](security.md).

## Check your install

`bun run check` regenerates the route manifests, type-checks, runs the tests and builds the project.
