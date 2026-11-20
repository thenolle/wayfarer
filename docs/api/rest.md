# REST API

All endpoints live under `/api`. Successful responses are `{ "data": ... }`.
Errors are `{ "error": { "code": "...", "message": "..." } }`. Messages never
include file system paths or internal details.

| Method | Endpoint                    | Purpose                                                              |
| ------ | --------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/health`               | Liveness check. Never requires authentication.                       |
| GET    | `/api/downloads`            | List downloads. Optional `?status=queued,paused`.                    |
| GET    | `/api/downloads/:id`        | Download details including segments.                                 |
| POST   | `/api/downloads`            | Add a download. Returns `201`.                                       |
| POST   | `/api/downloads/:id/pause`  | Pause.                                                               |
| POST   | `/api/downloads/:id/resume` | Resume a paused or failed download.                                  |
| POST   | `/api/downloads/:id/cancel` | Cancel and discard partial data.                                     |
| DELETE | `/api/downloads/:id`        | Delete the record. `?deleteFile=true` also deletes a completed file. |
| GET    | `/api/downloads/:id/file`   | Stream a completed file. Supports one `Range`.                       |
| GET    | `/api/settings/bandwidth`   | Current global limit.                                                |
| PATCH  | `/api/settings/bandwidth`   | Set the limit in bytes per second; `0` is unlimited.                 |

### Add a torrent file

`POST /api/downloads/torrent` queues a `.torrent` file. Send the raw file as the body, or as a `file` field in `multipart/form-data`. Optional query parameters: `priority`, `location`, `subfolder` and `allowDuplicate=true`. Answers `201` with the download, `400` for an invalid file, `409 duplicate` for a torrent already in the list and `413` for files over 8 MiB.

Magnet links and `.torrent` links go to `POST /api/downloads` like any other link:

```bash
curl -X POST http://127.0.0.1:8787/api/downloads \\
  -H 'content-type: application/json' \\
  -d '{"url":"magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a"}'

curl -X POST 'http://127.0.0.1:8787/api/downloads/torrent?location=main' \\
  -H 'content-type: application/x-bittorrent' \\
  --data-binary @example.torrent
```

Add `-H "Authorization: Bearer $TOKEN"` to both calls if you set `WAYFARER_AUTH_TOKEN`.

## Examples

```bash
curl -X POST http://127.0.0.1:8787/api/downloads \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $WAYFARER_AUTH_TOKEN" \
  -d '{"url":"[https://example.com/archive.zip](https://example.com/archive.zip)","priority":5,"sha256":"<64 hex characters>"}'

curl -H "Authorization: Bearer $WAYFARER_AUTH_TOKEN" http://127.0.0.1:8787/api/downloads

curl -X PATCH http://127.0.0.1:8787/api/settings/bandwidth \
  -H 'Content-Type: application/json' \
  -d '{"bytesPerSecond":2000000}'
```

Request fields for `POST /api/downloads`: `url` (required), `priority` (integer
-100 to 100), `sha256` (64 hex characters), `filename` (a suggested name; it is
sanitised), and `allowDuplicate` (optional boolean; set to `true` to allow a
download that would otherwise be rejected as a duplicate).

## Status codes

`400` invalid input, `401` missing or wrong token, `403` cross-origin request,
`404` unknown download or file, `409` the download's state does not allow the
action or `duplicate` when adding a duplicate download, `413` body over 64 KiB,
`415` not `application/json`, `416`
unsatisfiable range, `421` host name not allowed, `503` shutting down.

## Queue, statistics and transfer

| Method | Path                    | Result                                                                                                                                                              |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/queue/:operation` | `pause-all`, `resume-all`, `retry-failed`, `clear-finished` or `clear-failed`. Returns `{ "data": { "operation", "matched", "done" } }`.                            |
| `GET`  | `/api/stats`            | Counts by status, speed, completed bytes, speed limit and uptime.                                                                                                   |
| `GET`  | `/api/metrics`          | The same in Prometheus text format.                                                                                                                                 |
| `GET`  | `/api/export`           | The list as `{ "data": { "version", "exportedAt", "downloads" } }`. Optional `?status=queued,paused`.                                                               |
| `POST` | `/api/import`           | Accepts an export, a list of objects or a list of links, plus optional `"allowDuplicate": true`. Returns `{ "data": { "added", "skipped" } }`. At most 500 entries. |

## Security

- Wayfarer binds to `127.0.0.1` by default. Binding to any other address
  requires `WAYFARER_AUTH_TOKEN` (16 or more characters). Binding to `0.0.0.0`
  or `::` also requires `WAYFARER_ALLOWED_HOSTS`.
- With a token set, every endpoint except `/api/health` needs
  `Authorization: Bearer <token>`. The token is compared in constant time.
- The `Host` header must be a loopback name, the bind address or an entry of
  `WAYFARER_ALLOWED_HOSTS` (host names without ports; IPv6 in brackets). This
  blocks DNS rebinding.
- Requests that change state and carry an `Origin` header must be same-origin,
  and `Sec-Fetch-Site: cross-site` is refused. JSON endpoints require
  `Content-Type: application/json`.
- Served files are attachments with `nosniff` and `Content-Security-Policy:
  sandbox`. Clients never supply paths.
- Behind a reverse proxy, terminate TLS at the proxy, forward the original
  `Host` header, and list the public host name in `WAYFARER_ALLOWED_HOSTS`.
  Without TLS, bearer tokens travel in clear text.

## Locations

| Method   | Path                 | Body                                         | Result                                                              |
| -------- | -------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| `GET`    | `/api/locations`     |                                              | All locations with `id`, `label`, `path`, `managed` and `downloads` |
| `POST`   | `/api/locations`     | `{ "label": "Games", "path": "/srv/games" }` | `201` with the new location                                         |
| `PATCH`  | `/api/locations/:id` | `label` and/or `path`                        | The updated location                                                |
| `DELETE` | `/api/locations/:id` |                                              | `204`                                                               |

Only locations added through the dashboard or API can be changed. A location that holds downloads cannot be moved or removed (`409 location_in_use`).

## Limitations

- `HEAD` requests are not routed and return `405`; use `GET`.
- Only one byte range per request is supported, and `If-Range` is ignored.
- There is no rate limiting on the API.
- Browser sessions and CSRF tokens for the dashboard are not part of this API
  yet; scripts and tools use the bearer token.
- The API adds downloads to the main download directory. Save locations are
  chosen in the dashboard only.
- The dashboard's link check (`/actions/preview`) is not part of this API.
