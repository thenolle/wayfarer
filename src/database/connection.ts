import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { applyMigrations } from './schema'

const IN_MEMORY = ':memory:'

/**
 * Opens (and creates if needed) the SQLite database, configures it for
 * durability and concurrent readers, and applies pending migrations.
 *
 * Settings: WAL journal, `synchronous = NORMAL`, a 5 second busy timeout and
 * enforced foreign keys.
 */
export function openDatabase(path: string): Database {
	if (path !== IN_MEMORY) mkdirSync(dirname(path), { recursive: true })
	const database = new Database(path, { create: true, strict: true })
	database.run('PRAGMA journal_mode = WAL')
	database.run('PRAGMA synchronous = NORMAL')
	database.run('PRAGMA busy_timeout = 5000')
	database.run('PRAGMA foreign_keys = ON')
	applyMigrations(database)
	return database
}

/**
 * Checkpoints the write-ahead log into the main database file and closes the
 * connection. Call once during shutdown, after all writers have stopped.
 */
export function closeDatabase(database: Database): void {
	database.run('PRAGMA wal_checkpoint(TRUNCATE)')
	database.close()
}
