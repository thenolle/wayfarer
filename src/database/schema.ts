import type { Database } from 'bun:sqlite'
import { DOWNLOAD_STATUSES } from '../downloads/domain/status'
import { SEGMENT_STATUSES } from '../downloads/domain/records'
import { inTransaction } from './sql'

function sqlList(values: readonly string[]): string {
	return values.map((value) => `'${value}'`).join(', ')
}

/**
 * Ordered schema migrations. Entry `n` upgrades the database from version `n`
 * to `n + 1`, tracked with `PRAGMA user_version`. Never edit a released
 * migration; append a new one.
 */
export const MIGRATIONS: readonly string[] = [
	`
  CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    resolver TEXT,
    resolved_url TEXT,
    resolved_metadata TEXT,
    filename TEXT NOT NULL,
    destination TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (${sqlList(DOWNLOAD_STATUSES)})),
    priority INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER CHECK (total_bytes IS NULL OR total_bytes >= 0),
    downloaded_bytes INTEGER NOT NULL DEFAULT 0 CHECK (downloaded_bytes >= 0),
    speed_bps REAL NOT NULL DEFAULT 0,
    eta_seconds INTEGER,
    etag TEXT,
    last_modified TEXT,
    expected_sha256 TEXT,
    actual_sha256 TEXT,
    error_code TEXT,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE UNIQUE INDEX idx_downloads_destination ON downloads (destination COLLATE NOCASE);
  CREATE INDEX idx_downloads_queue ON downloads (status, priority DESC, created_at);

  CREATE TABLE segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_id TEXT NOT NULL REFERENCES downloads (id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL CHECK (segment_index >= 0),
    start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
    end_offset INTEGER NOT NULL,
    durable_offset INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN (${sqlList(SEGMENT_STATUSES)})),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    UNIQUE (download_id, segment_index),
    CHECK (end_offset >= start_offset),
    CHECK (durable_offset >= start_offset AND durable_offset <= end_offset + 1)
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `
]

function currentVersion(database: Database): number {
	const row = database.query<{ user_version: number }, []>('PRAGMA user_version').get()
	return row?.user_version ?? 0
}

/**
 * Applies every migration newer than the database's current version. Each
 * migration and its version bump commit atomically.
 *
 * @throws {Error} when the database was created by a newer Wayfarer version.
 */
export function applyMigrations(database: Database): void {
	const version = currentVersion(database)
	if (version > MIGRATIONS.length) throw new Error(`Database schema version ${version} is newer than this build supports (${MIGRATIONS.length})`)
	for (let next = version; next < MIGRATIONS.length; next += 1) {
		const migration = MIGRATIONS[next]
		if (migration === undefined) continue
		inTransaction(database, () => {
			database.run(migration)
			database.run(`PRAGMA user_version = ${next + 1}`)
		})
	}
}
