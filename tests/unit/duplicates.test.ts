import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { InvalidDownloadError } from '../../src/downloads/domain/validation'
import { DownloadIntake, DuplicateDownloadError, duplicateKey } from '../../src/downloads/intake'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'

let context: TestContext
let intake: DownloadIntake

beforeEach(async () => {
	context = await createTestContext()
	intake = new DownloadIntake({ downloads: context.downloads, downloadDirectory: join(context.directory, 'downloads'), isAccepting: () => true, onAdded: () => undefined })
})

afterEach(async () => {
	await context.dispose()
})

describe('duplicate links', () => {
	test('refuses a link that is already in the list', async () => {
		await intake.add({ url: 'https://example.test/a.zip' })
		const error = await intake.add({ url: 'https://example.test/a.zip' }).catch((caught: unknown) => caught)
		expect(error).toBeInstanceOf(DuplicateDownloadError)
		expect(error).toBeInstanceOf(InvalidDownloadError)
		expect((error as Error).message).toBe('“a.zip” is already in your downloads (queued).')
		expect(context.downloads.list()).toHaveLength(1)
	})

	test('ignores the fragment, host case and default port but not the query', async () => {
		await intake.add({ url: 'https://Example.test:443/a.zip#top' })
		expect(intake.add({ url: 'https://example.test/a.zip' })).rejects.toBeInstanceOf(DuplicateDownloadError)
		expect(intake.add({ url: 'https://example.test/a.zip?v=2' })).resolves.toBeDefined()
		expect(duplicateKey(new URL('https://EXAMPLE.test:443/a#x'))).toBe('https://example.test/a')
	})

	test('adds the link anyway when asked to', async () => {
		await intake.add({ url: 'https://example.test/a.zip' })
		const again = await intake.add({ url: 'https://example.test/a.zip', allowDuplicate: true })
		expect(again.filename).toBe('a (1).zip')
	})

	test('catches the same link twice in one batch', async () => {
		const results = await Promise.allSettled([intake.add({ url: 'https://example.test/b.zip' }), intake.add({ url: 'https://example.test/b.zip' })])
		expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
	})

	test('cancelled downloads do not block a new one', async () => {
		const first = await intake.add({ url: 'https://example.test/c.zip' })
		context.downloads.setStatus(first.id, 'cancelled', {})
		expect(intake.add({ url: 'https://example.test/c.zip' })).resolves.toBeDefined()
	})

	test('a completed download blocks only while its file exists', async () => {
		const first = await intake.add({ url: 'https://example.test/d.zip' })
		for (const status of ['probing', 'downloading', 'completed'] as const) context.downloads.setStatus(first.id, status, {})
		await Bun.write(first.destination, 'data')
		const error = await intake.add({ url: 'https://example.test/d.zip' }).catch((caught: unknown) => caught)
		expect((error as Error).message).toBe('“d.zip” was already downloaded.')
		await rm(first.destination)
		expect(intake.add({ url: 'https://example.test/d.zip' })).resolves.toBeDefined()
	})
})
