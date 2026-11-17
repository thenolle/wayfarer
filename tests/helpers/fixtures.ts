import type { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, openDatabase } from '../../src/database/connection'
import { DownloadsRepository } from '../../src/database/downloads-repository'
import { SegmentsRepository } from '../../src/database/segments-repository'

export interface TestContext {
	readonly directory: string
	readonly database: Database
	readonly downloads: DownloadsRepository
	readonly segments: SegmentsRepository
	dispose(): Promise<void>
}

/**
 * Creates an isolated temporary directory with a file-backed database.
 */
export async function createTestContext(): Promise<TestContext> {
	const directory = await mkdtemp(join(tmpdir(), 'wayfarer-test-'))
	const database = openDatabase(join(directory, 'test.sqlite'))
	return {
		directory,
		database,
		downloads: new DownloadsRepository(database),
		segments: new SegmentsRepository(database),
		async dispose() {
			closeDatabase(database)
			await rm(directory, { recursive: true, force: true })
		}
	}
}
