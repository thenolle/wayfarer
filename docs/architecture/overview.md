# Architecture overview

Wayfarer is a single Bun process with a clear separation of responsibilities.

| Area               | Location                                        | Responsibility                                                      |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| Configuration      | `src/config`                                    | Parse and validate environment settings.                            |
| Domain             | `src/downloads/domain`                          | Statuses, transitions, records and checksum state.                  |
| Persistence        | `src/database`                                  | SQLite connection, migrations and repositories.                     |
| Segments           | `src/downloads/segments`                        | Byte-range planning.                                                |
| Engine             | `src/downloads/engine`                          | Probing, segmented transfer, verification and finalisation.         |
| Resolvers and HTTP | `src/downloads/resolvers`, `src/downloads/http` | Turn links into files; guarded network access.                      |
| Scheduler          | `src/downloads/scheduler`                       | Priorities, concurrency, bandwidth limit and lifecycle commands.    |
| Recovery           | `src/downloads/recovery`                        | Reconcile interrupted downloads with files on disk.                 |
| Filesystem         | `src/filesystem`                                | Filename safety, destinations, save locations, atomic finalisation. |
| Security           | `src/security`                                  | Network policy and address rules.                                   |
| Transport          | `src/http`, `src/websocket`, `src/server`       | REST API, form actions, sessions, live updates.                     |
| Dashboard          | `src/ui`                                        | Gambrel-rendered pages, components and browser scripts.             |
| Wiring             | `src/app`                                       | The runtime that connects everything, and graceful shutdown.        |

## Rules

- Database, filesystem, networking and configuration code is server-only and is never imported by browser code.
- Dependencies point inward: filesystem and database modules may use domain types; domain modules import nothing from them.
- The SQLite database is the source of truth for download state. Only bytes that were durably written are recorded as progress.

## Download states

```text
queued ─► probing ─► downloading ─► verifying ─► completed
   │         │           │             │
   ▼         ▼           ▼             ▼
 paused    failed ◄──────┴─────────────┘      cancelled
```

`paused` returns to `queued`; `failed` can be retried by returning to `queued`. `completed` and `cancelled` are final. The full transition table is in `src/downloads/domain/status.ts`.

## Part files and recovery

Downloads are written to `<destination>.part`, preallocated to the expected size. Segment offsets in SQLite are durable offsets: the next byte that has not been confirmed on disk. After a crash, recovery compares those offsets with the part file. Consistent downloads resume from the recorded offsets. Inconsistent ones, such as a missing or wrongly sized part file, restart from zero. Recovery can be repeated safely.

## Destinations and save locations

A download goes to the main download directory or to a location named in `WAYFARER_LOCATIONS`, optionally inside a subfolder. The browser sends a location id, never a path. Reading, serving and deleting files is confined to the configured locations.

New destinations never replace an existing file. Names are compared case-insensitively on every platform, so behaviour is identical on case-sensitive and case-insensitive filesystems. A unique index on the destination column enforces this in the database.

Finalisation uses a hard link followed by removal of the part file, which fails instead of overwriting. On filesystems without hard-link support it falls back to a check followed by a rename. That fallback has a short window in which another process could create the destination.
