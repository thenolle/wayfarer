import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { recoverInterruptedDownloads } from '../../src/downloads/recovery/recover'
import { planSegments } from '../../src/downloads/segments/plan'
import { partPathFor } from '../../src/filesystem/paths'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'

const TOTAL = 4 * 1024 * 1024
let context: TestContext

beforeEach(async () => {
	context = await createTestContext()
})

afterEach(async () => {
	await context.dispose()
})

async function seedInterrupted(options: { partSize: number | null; durable: number }) {
	const destination = join(context.directory, 'file.bin')
	const download = context.downloads.create({ url: 'https://example.test/file.bin', filename: 'file.bin', destination })
	context.downloads.setStatus(download.id, 'probing')
	context.downloads.setStatus(download.id, 'downloading', { totalBytes: TOTAL })
	const segments = context.segments.replace(download.id, planSegments(TOTAL, 4))
	const first = segments[0]
	if (first === undefined) throw new Error('segment missing')
	context.segments.saveDurable([{ id: first.id, durableOffset: first.startOffset + options.durable, status: 'active' }])
	if (options.partSize !== null) await Bun.write(partPathFor(destination), new Uint8Array(options.partSize))
	return { download, destination }
}

describe('recoverInterruptedDownloads', () => {
	test('resumes from durable offsets when the part file matches', async () => {
		const { download } = await seedInterrupted({ partSize: TOTAL, durable: 1000 })
		const report = await recoverInterruptedDownloads(context.downloads, context.segments)
		expect(report.resumed).toEqual([download.id])
		const recovered = context.downloads.require(download.id)
		expect(recovered.status).toBe('queued')
		expect(recovered.downloadedBytes).toBe(1000)
		expect(context.segments.list(download.id)[0]?.durableOffset).toBe(1000)
	})

	test('restarts when the part file is missing', async () => {
		const { download } = await seedInterrupted({ partSize: null, durable: 1000 })
		const report = await recoverInterruptedDownloads(context.downloads, context.segments)
		expect(report.restarted).toEqual([{ id: download.id, reason: 'part-file-missing' }])
		expect(context.downloads.require(download.id).downloadedBytes).toBe(0)
		expect(context.segments.list(download.id)).toEqual([])
	})

	test('restarts and removes a part file of the wrong size', async () => {
		const { download, destination } = await seedInterrupted({ partSize: TOTAL - 1, durable: 1000 })
		const report = await recoverInterruptedDownloads(context.downloads, context.segments)
		expect(report.restarted).toEqual([{ id: download.id, reason: 'part-file-size-mismatch' }])
		expect(stat(partPathFor(destination))).rejects.toThrow()
	})

	test('sends fully downloaded segments to verification, not to completed', async () => {
		const { download } = await seedInterrupted({ partSize: TOTAL, durable: 0 })
		for (const segment of context.segments.list(download.id)) context.segments.saveDurable([{ id: segment.id, durableOffset: segment.endOffset + 1, status: 'completed' }])
		const report = await recoverInterruptedDownloads(context.downloads, context.segments)
		expect(report.toVerify).toEqual([download.id])
		expect(context.downloads.require(download.id).status).toBe('queued')
		expect(context.downloads.require(download.id).downloadedBytes).toBe(TOTAL)
	})

	test('is idempotent', async () => {
		await seedInterrupted({ partSize: TOTAL, durable: 1000 })
		await recoverInterruptedDownloads(context.downloads, context.segments)
		const second = await recoverInterruptedDownloads(context.downloads, context.segments)
		expect(second).toEqual({ resumed: [], toVerify: [], restarted: [] })
	})

	test('leaves paused and queued downloads alone', async () => {
		const destination = join(context.directory, 'idle.bin')
		const download = context.downloads.create({ url: 'https://example.test/idle.bin', filename: 'idle.bin', destination })
		context.downloads.setStatus(download.id, 'paused')
		const report = await recoverInterruptedDownloads(context.downloads, context.segments)
		expect(report).toEqual({ resumed: [], toVerify: [], restarted: [] })
		expect(context.downloads.require(download.id).status).toBe('paused')
	})
})
