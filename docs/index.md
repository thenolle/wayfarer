## What is Wayfarer?

Wayfarer is a background download manager. It runs as a small service, keeps downloading when no browser tab is open, remembers its work in a SQLite database and picks up where it stopped after a restart or a crash.

You control it from a dashboard in your browser, or through a JSON REST API.

## Quick start

```bash
git clone https://github.com/thenolle/wayfarer.git
cd wayfarer
bun install
bun run build
bun run start
```

Open <http://127.0.0.1:8787>, paste a link and press **Add**.

> [!NOTE]
> Wayfarer is source-available under the PolyForm Strict License 1.0.0. It is not open-source software. You may use it for noncommercial purposes; see the license for the exact terms.

## Where to go next

- New here? Read [Getting started](getting-started.md).
- Looking for a setting? See [Configuration](configuration.md).
- Something went wrong? See [Troubleshooting](guides/troubleshooting.md).
- Running it on a server? See [Docker](deployment/docker.md) and [Security model](security.md).
