# Docker

The image builds the application in one stage and runs it in a second, as the
unprivileged `bun` user. Data lives in the `/data` volume: the SQLite database
and, by default, the downloaded files.

## Run with Docker Compose

```bash
cp .env.example .env
# edit .env: set WAYFARER_AUTH_TOKEN (for example: openssl rand -hex 32)
docker compose up -d --build
docker compose logs -f wayfarer
```

Open <http://127.0.0.1:8787> and sign in with the token. Compose publishes the
port on the local machine only. To reach it from other machines, put a
[reverse proxy](reverse-proxy.md) in front rather than publishing the port.

The container listens on `0.0.0.0` inside Docker. For that reason it refuses to
start without `WAYFARER_AUTH_TOKEN` (16 or more characters) and
`WAYFARER_ALLOWED_HOSTS`. Compose supplies a default for the latter.

## Choosing where files go

By default downloads are stored in the `wayfarer-data` volume. To store them on
the host, mount a directory over the downloads folder:

```yaml
    volumes:
      - wayfarer-data:/data
      - /srv/downloads:/data/downloads
```

The directory must be writable by user ID 1000 (the `bun` user).

## Stopping, health and upgrades

- `docker compose stop` sends `SIGTERM`. Wayfarer stops downloads, saves their
  progress and exits; Compose allows 40 seconds. Unfinished downloads resume
  when the container starts again.
- The image has a health check against `/api/health`.
- To upgrade, pull the new source, then run `docker compose up -d --build`.
  The database migrates itself on start.

## Pinning the Bun version

The Dockerfile uses the `oven/bun:1` image by default. Pin an exact version with
`docker build --build-arg BUN_VERSION=<version> .`.

## Notes

- The root file system is read-only and all capabilities are dropped. If your
  setup needs Bun to write elsewhere, remove `read_only: true` from
  `docker-compose.yml`.
- This configuration is built and health-checked in CI. Behaviour on your host
  (volumes, user IDs) depends on your Docker setup.
