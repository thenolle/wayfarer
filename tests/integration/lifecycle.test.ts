import { afterEach, describe, expect, test } from 'bun:test'
import { durableBytes, planSegments } from '../../src/downloads/segments/plan'
import { hashFile } from '../../src/downloads/verification/sha256'
import { partPathFor } from '../../src/filesystem/paths'
import { fileSize } from '../../src/filesystem/stat'
import { createHarness, sha256Hex } from '../helpers/harness'
import type { Harness } from '../helpers/harness'
import { makeBody } from '../helpers/origin'
import { waitFor } from '../helpers/wait'

const SIZE = 4 * 1024 * 1024 + 123
const SLOW = { chunkBytes: 64 * 1024, delayMs: 25 }

let harness: Harness | null = null

afterEach(async () => {
	await harness?.dispose()
	harness = null
})

async function setup(options: Parameters<typeof createHarness>[0] = {}): Promise<Harness> {
	harness = await createHarness(options)
	return harness
}

function status(h: Harness, id: string): string {
	return h.context.downloads.require(id).status
}

describe('download lifecycle', () => {
	test('pauses mid-transfer and resumes from the saved offsets', async () => {
		const body = makeBody(SIZE)
		const h = await setup({ origin: { body, slow: SLOW } })
		const queued = await h.enqueue('/file')
		h.scheduler.start()
		await waitFor(() => h.context.downloads.require(queued.id).downloadedBytes > 200_000)
		const paused = await h.scheduler.pause(queued.id)
		expect(paused.status).toBe('paused')
		expect(paused.downloadedBytes).toBeGreaterThan(0)
		const rows = h.context.segments.list(queued.id)
		expect(rows.some((row) => durableBytes(row) > 0)).toBe(true)
		expect(await fileSize(partPathFor(queued.destination))).toBe(SIZE)
		h.origin.state.slow = null
		const requestsBefore = h.origin.requests.length
		h.scheduler.resume(queued.id)
		await waitFor(() => status(h, queued.id) === 'completed')
		expect(await hashFile(queued.destination)).toBe(sha256Hex(body))
		const segmentStarts = new Set(planSegments(SIZE, 4).map((segment) => segment.startOffset))
		const resumedStarts = h.origin.requests.slice(requestsBefore).map((request) => /^bytes=(\d+)-/.exec(request.range ?? '')?.[1]).filter((value): value is string => value !== undefined).map(Number)
		expect(resumedStarts.some((start) => !segmentStarts.has(start))).toBe(true)
	})

	test('cancel removes partial data and stops all requests', async () => {
		const h = await setup({ origin: { body: makeBody(SIZE), slow: SLOW } })
		const queued = await h.enqueue('/file')
		h.scheduler.start()
		await waitFor(() => h.context.downloads.require(queued.id).downloadedBytes > 100_000)
		const cancelled = await h.scheduler.cancel(queued.id)
		expect(cancelled.status).toBe('cancelled')
		expect(await Bun.file(partPathFor(queued.destination)).exists()).toBe(false)
		expect(await Bun.file(queued.destination).exists()).toBe(false)
		expect(h.context.segments.list(queued.id)).toEqual([])
		const requestsAfterCancel = h.origin.requests.length
		await Bun.sleep(150)
		expect(h.origin.requests.length).toBe(requestsAfterCancel)
	})

	test('the bandwidth limit applies to all segments together', async () => {
		const body = makeBody(2 * 1024 * 1024 + 123)
		const h = await setup({ origin: { body }, bandwidthLimit: 1024 * 1024 })
		const queued = await h.enqueue('/file')
		const started = performance.now()
		const outcome = await h.run(queued.id)
		const elapsed = performance.now() - started
		expect(outcome.kind).toBe('completed')
		expect(await hashFile(queued.destination)).toBe(sha256Hex(body))
		expect(elapsed).toBeGreaterThan(800)
	})

	test('shutdown stores durable offsets and the next start resumes', async () => {
		const body = makeBody(SIZE)
		const h = await setup({ origin: { body, slow: SLOW } })
		const queued = await h.enqueue('/file')
		h.scheduler.start()
		await waitFor(() => h.context.downloads.require(queued.id).downloadedBytes > 200_000)
		await h.scheduler.shutdown()
		expect(status(h, queued.id)).toBe('queued')
		const rows = h.context.segments.list(queued.id)
		expect(rows.reduce((sum, row) => sum + durableBytes(row), 0)).toBeGreaterThan(0)
		expect(await fileSize(partPathFor(queued.destination))).toBe(SIZE)
		h.origin.state.slow = null
		h.createScheduler().start()
		await waitFor(() => status(h, queued.id) === 'completed')
		expect(await hashFile(queued.destination)).toBe(sha256Hex(body))
	})

	test('runs several downloads within the concurrency limit and gives each its own name', async () => {
		const body = makeBody(50_000)
		const h = await setup({ origin: { body }, maxConcurrentDownloads: 2 })
		const ids = await Promise.all([1, 2, 3, 4].map(async (n) => (await h.enqueue('/file', { filename: `f${n}.bin` })).id))
		h.scheduler.start()
		await waitFor(() => ids.every((id) => status(h, id) === 'completed'))
		for (const id of ids) expect(await hashFile(h.context.downloads.require(id).destination)).toBe(sha256Hex(body))
		const names = ids.map((id) => h.context.downloads.require(id).filename).sort()
		expect(names).toEqual(['file', 'file (1)', 'file (2)', 'file (3)'])
	})
})
