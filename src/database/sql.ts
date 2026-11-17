import type { Database } from 'bun:sqlite'

/**
 * Values that can be bound to a SQLite parameter.
 */
export type Binding = string | number | null

/**
 * Runs `work` inside a SQLite transaction. The transaction commits when
 * `work` returns and rolls back when it throws. Nested calls become
 * savepoints.
 */
export function inTransaction<R>(database: Database, work: () => R): R {
  const run = database.transaction(work)
  return run()
}
