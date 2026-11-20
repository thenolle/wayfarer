# Torrents

Wayfarer downloads torrents through [aria2](https://aria2.github.io/), which it
starts and stops for you. Torrents use the same queue, priorities, pause,
resume, cancel, save locations, webhooks and dashboard as every other download.

## Install aria2

| System           | Command                        |
| ---------------- | ------------------------------ |
| Windows          | `winget install aria2.aria2`   |
| macOS (Homebrew) | `brew install aria2`           |
| Debian, Ubuntu   | `sudo apt install aria2`       |
| Docker           | Included in the Wayfarer image |

Wayfarer looks for `aria2c` on your `PATH`. Set `WAYFARER_ARIA2_PATH` to use
another location. A torrent fails with a clear message if aria2 is missing; all
other downloads are unaffected.

## Add a torrent

- **Magnet link:** paste it into "Add downloads" or send it to `POST /api/downloads` as `url`.
- **`.torrent` link:** paste an `http(s)` link that ends in `.torrent`. Wayfarer fetches the file through its guarded network client, then queues the torrent inside it.
- **`.torrent` file:** choose one or more files in "Torrent files", or send one to `POST /api/downloads/torrent` (see the [REST API](../api/rest.md)).

"Check link" shows the name and size for `.torrent` links, and the name for magnet links that have one.

## What to expect

- A magnet link starts as `probing` while peers send the torrent's details. If none do within `WAYFARER_TORRENT_METADATA_TIMEOUT_MS`, the download fails with a message you can retry.
- The torrent takes the name it was published with. File names and checksums cannot be set for torrents, because every piece is verified automatically.
- Data is written to a hidden `.<id>.torrent-part` folder in the chosen location and renamed into place when it is complete. A single-file torrent becomes a file; a multi-file torrent becomes a folder.
- Pause, shutdown and crashes keep the verified pieces. Resuming continues from them.
- Wayfarer does not seed. aria2 stops as soon as the download is complete.
- The same torrent is detected as a duplicate by its info hash, however the link is written.

## Limits

- The global speed limit is passed to aria2 as its own overall limit. When HTTP downloads and torrents run together, the two limits are applied separately.
- Peer connections are made by aria2, so the [network policy](../security.md) and `WAYFARER_ALLOW_PRIVATE_NETWORKS` do not apply to them.
- BitTorrent v2-only torrents are not supported. Hybrid torrents work.
- A multi-file torrent is a folder, so the dashboard's "Download file" link is not available for it. Use "Show in folder" on a local install, or read the files from the save location.
- For the best speed, allow incoming connections. Set `WAYFARER_TORRENT_LISTEN_PORT` and forward that TCP and UDP port on your router. In Docker, publish the same port.
