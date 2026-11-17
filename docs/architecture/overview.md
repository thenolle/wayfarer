# Architecture overview

Wayfarer is a single Bun process with a clear separation of responsibilities.

| Area          | Location                 | Responsibility                                      |
| ------------- | ------------------------ | --------------------------------------------------- |
| Configuration | `src/config`             | Parse and validate environment settings.            |
| Domain        | `src/downloads/domain`   | Statuses, transitions, records and checksum state.  |
| Persistence   | `src/database`           | SQLite connection, migrations and repositories.     |
| Segments      | `src/downloads/segments` | Byte-range planning.                                |
| Recovery      | `src/downloads/recovery` | Reconcile interrupted downloads with files on disk. |
| Filesystem    | `src/filesystem`         | Filename safety, destinations, atomic finalisation. |

Later areas follow the same pattern: resolvers, the download engine, the
scheduler, HTTP transport and the Gambrel-rendered dashboard.

## Rules

- Database, filesystem, networking and configuration code is server-only and
  is never imported by browser code.
- Dependencies point inward: filesystem and database modules may use domain
  types; domain modules import nothing from them.
- The SQLite database is the source of truth for download state. Only bytes
  that were durably written are recorded as progress.

## Download states

```text
queued ─► probing ─► downloading ─► verifying ─► completed
   │         │           │             │
   ▼         ▼           ▼             ▼
 paused    failed ◄──────┴─────────────┘      cancelled
```

`paused` returns to `queued`; `failed` can be retried by returning to
`queued`. `completed` and `cancelled` are final. The full transition table is in
`src/downloads/domain/status.ts`.

## Part files and recovery

Downloads are written to `<destination>.part`, preallocated to the expected
size. Segment offsets in SQLite are durable offsets: the next byte that has
not been confirmed on disk. After a crash, recovery compares those offsets
with the part file. Consistent downloads resume from the recorded offsets.
Inconsistent ones, such as a missing or wrongly sized part file, restart from
zero. Recovery can be repeated safely.

## Destination allocation

New destinations are chosen so that they never replace an existing file.
Names are compared case-insensitively on every platform, so a download behaves
the same on case-sensitive and case-insensitive filesystems. A unique index on
the destination column enforces this in the database.

Finalisation uses a hard link followed by removal of the part file, which
fails instead of overwriting. On filesystems without hard-link support it
falls back to a check followed by a rename. That fallback has a short window in
which another process could create the destination.
