import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { InvalidDownloadError } from '../../src/downloads/domain/validation'
import { DownloadIntake, ShuttingDownError } from '../../src/downloads/intake'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'

let context: TestContext
let accepting = true
let added = 0
let intake: DownloadIntake

beforeEach(async () => {
	context = await createTestContext()
	accepting = true
	added = 0
	intake = new DownloadIntake({
		downloads: context.downloads,
		downloadDirectory: join(context.directory, 'downloads'),
		isAccepting: () => accepting,
		onAdded: () => {
			added += 1
		}
	})
})

afterEach(async () => {
	await context.dispose()
})

describe('DownloadIntake', () => {
	test('queues a download named after the URL', async () => {
		const record = await intake.add({ url: 'https://example.test/files/my%20archive.zip?token=1' })
		expect(record.status).toBe('queued')
		expect(record.filename).toBe('my archive.zip')
		expect(record.priority).toBe(0)
		expect(record.destination.startsWith(join(context.directory, 'downloads'))).toBe(true)
		expect(added).toBe(1)
	})

	test('uses a sanitised custom filename, priority and checksum', async () => {
		const record = await intake.add({ url: 'https://example.test/x', filename: '../evil.txt', priority: 10, expectedSha256: `  ${'AB'.repeat(32)} ` })
		expect(record.filename).toBe('evil.txt')
		expect(record.priority).toBe(10)
		expect(record.expectedSha256).toBe('ab'.repeat(32))
	})

	test('gives concurrent requests for the same name distinct destinations', async () => {
		const records = await Promise.all([1, 2, 3, 4, 5].map((n) => intake.add({ url: `https://example.test/${n}/archive.zip` })))
		const names = records.map((record) => record.filename).sort()
		expect(names).toEqual(['archive (1).zip', 'archive (2).zip', 'archive (3).zip', 'archive (4).zip', 'archive.zip'])
	})

	test.each([
		['not a url', {}],
		['', {}],
		['ftp://example.test/file', {}],
		['file:///etc/passwd', {}],
		['https://user:secret@example.test/file', {}],
		['https://example.test/file', { priority: 1000 }],
		['https://example.test/file', { priority: 1.5 }],
		['https://example.test/file', { expectedSha256: 'xyz' }]
	])('rejects %s %j', async (url, extra) => {
		expect(intake.add({ url, ...extra })).rejects.toBeInstanceOf(InvalidDownloadError)
		expect(context.downloads.list()).toHaveLength(0)
	})

	test('a rejected request does not block later ones', async () => {
		expect(intake.add({ url: 'nope' })).rejects.toBeInstanceOf(InvalidDownloadError)
		expect((await intake.add({ url: 'https://example.test/ok.bin' })).filename).toBe('ok.bin')
	})

	test('refuses new downloads while shutting down', async () => {
		accepting = false
		expect(intake.add({ url: 'https://example.test/file' })).rejects.toBeInstanceOf(ShuttingDownError)
		expect(context.downloads.list()).toHaveLength(0)
	})
})
