import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DownloadScheduler } from '../../src/downloads/scheduler/scheduler'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'

let context: TestContext
let root: string
let discarded: string[]
let scheduler: DownloadScheduler

beforeEach(async () => {
	context = await createTestContext()
	root = join(context.directory, 'downloads')
	await mkdir(root, { recursive: true })
	discarded = []
	scheduler = new DownloadScheduler(
		{ downloads: context.downloads, segments: context.segments, runner: { run: async () => ({ kind: 'completed' }) }, discard: async (record) => { discarded.push(record.id) } },
		{ maxConcurrentDownloads: 1, downloadDirectory: root }
	)
})

afterEach(async () => {
	await context.dispose()
})

describe('DownloadScheduler discard hook', () => {
	test('runs when an unfinished download is cancelled', async () => {
		const record = context.downloads.create({ url: 'magnet:?xt=urn:btih:abc', filename: 'a', destination: join(root, 'a') })
		await scheduler.cancel(record.id)
		expect(discarded).toEqual([record.id])
	})

	test('runs when an unfinished download is removed', async () => {
		const record = context.downloads.create({ url: 'magnet:?xt=urn:btih:abc', filename: 'a', destination: join(root, 'a') })
		expect(await scheduler.remove(record.id)).toBe(true)
		expect(discarded).toEqual([record.id])
	})

	test('does not run for completed downloads', async () => {
		const record = context.downloads.create({ url: 'https://example.test/a.zip', filename: 'a.zip', destination: join(root, 'a.zip') })
		for (const status of ['probing', 'downloading', 'completed'] as const) context.downloads.setStatus(record.id, status)
		await scheduler.remove(record.id)
		expect(discarded).toEqual([])
	})

	test('deletes a completed folder when its file is deleted', async () => {
		const destination = join(root, 'Show')
		await mkdir(destination, { recursive: true })
		await writeFile(join(destination, 'ep1.txt'), 'one')
		const record = context.downloads.create({ url: 'magnet:?xt=urn:btih:abc', filename: 'Show', destination })
		for (const status of ['probing', 'downloading', 'completed'] as const) context.downloads.setStatus(record.id, status)
		await scheduler.remove(record.id, { deleteFile: true })
		expect(existsSync(destination)).toBe(false)
	})
})
