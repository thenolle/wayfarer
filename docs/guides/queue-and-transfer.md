# Queue, export and retention

## Whole-queue actions

Open **Whole queue** above the list, or call `POST /api/queue/<operation>`.

| Operation        | Affects                           | Effect                       |
| ---------------- | --------------------------------- | ---------------------------- |
| `pause-all`      | Queued and running downloads      | Pauses them.                 |
| `resume-all`     | Paused downloads                  | Queues them again.           |
| `retry-failed`   | Failed downloads                  | Queues them for another try. |
| `clear-finished` | Completed and cancelled downloads | Removes them from the list.  |
| `clear-failed`   | Failed downloads                  | Removes them from the list.  |

Clearing removes list entries only. Files on disk are never deleted. A download that changes state while the operation runs is reported as "could not be changed".

## Export and import

**Export and import** in the dashboard saves the list as JSON, or adds the links from such a file. The API equivalents are `GET /api/export` (optionally `?status=queued,paused`) and `POST /api/import`.

- An export holds each link, file name, priority, checksum and status. It never holds file paths.
- An import adds every entry as a new queued download through the normal checks, so invalid links are skipped and duplicates are refused unless you tick **Add even if a link is already in the list**.
- An import accepts an export file, the raw API response, a list of objects, or a list of link strings. The limit is 500 links and 2 MB per import.

> [!WARNING]
> Exported files contain your links, which may include access tokens. Keep them private.

## Automatic cleanup

Set `WAYFARER_RETENTION_DAYS` to remove old finished entries from the list. The default `0` keeps everything.

- Completed and cancelled downloads older than the period are removed at startup and then every hour.
- Failed, paused, queued and running downloads are never removed.
- Files are never deleted. Once an entry is gone, its link no longer counts as a duplicate.
