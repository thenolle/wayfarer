# Scheduling and lifecycle

## Queue

Queued downloads start in priority order (highest first, range -100 to 100),
oldest first within a priority. At most `WAYFARER_MAX_CONCURRENT_DOWNLOADS`
downloads run at once, and at most `WAYFARER_MAX_CONCURRENT_SEGMENTS` segments
transfer at once across all of them. Each download uses up to
`WAYFARER_MAX_SEGMENTS` segments. Changing a priority affects which download
starts next; it never interrupts a running one.

## Bandwidth limit

One token bucket limits total throughput across every segment of every
download. It holds one second of tokens, so a transfer can burst up to one
second's worth of the limit before pacing begins. The limit is set with
`WAYFARER_BANDWIDTH_LIMIT` and can be changed at runtime; the runtime value is
stored in SQLite and takes precedence after a restart. `0` means unlimited.

## Commands

| Command | Effect                                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pause   | Stops the transfer and keeps the part file and segment offsets.                                                                                                         |
| resume  | Requeues a paused or failed download; failed downloads get a fresh retry count.                                                                                         |
| cancel  | Stops the transfer and deletes the part file and segments.                                                                                                              |
| remove  | Cancels if needed, then deletes the record. A completed file stays on disk unless deletion is requested, and only files inside the download directory are ever deleted. |

Stopping a download aborts its requests and waits until every write has settled
and progress has been flushed. A paused or cancelled download therefore holds no
connections and consumes no bandwidth once the command returns.

## Shutdown

On `SIGINT` or `SIGTERM` (`SIGINT` and `SIGBREAK` on Windows) Wayfarer:

1. Stops accepting new downloads and stops starting queued ones.
2. Aborts every running download's requests.
3. Waits for in-flight writes to finish.
4. Flushes the part file to disk and stores each segment's durable offset.
5. Returns the downloads to the queue so the next start resumes them.
6. Checkpoints the SQLite write-ahead log and closes the database.
7. Exits with code 0, or 1 if this takes longer than 30 seconds.

Stored offsets are written only after the file has been flushed, so they never
point past data that is not on disk.

## Startup

Before scheduling begins, downloads left probing, downloading or verifying by a
previous run are reconciled with the files on disk. Consistent ones resume from
their stored offsets; the rest restart from zero. See
[architecture overview](overview.md).

The service entry point currently starts the scheduler only. The HTTP API and
the web dashboard are not available yet.
