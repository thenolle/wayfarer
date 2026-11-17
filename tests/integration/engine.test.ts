import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { hashFile } from '../../src/downloads/verification/sha256'
import { planSegments } from '../../src/downloads/segments/plan'
import { partPathFor } from '../../src/filesystem/paths'
import { createHarness, sha256Hex } from '../helpers/harness'
import type { Harness } from '../helpers/harness'
import { makeBody } from '../helpers/origin'

const MULTI_SEGMENT_SIZE = 4 * 1024 * 1024 + 123

let harness: Harness | null = null

afterEach(async () => {
	await harness?.dispose()
	harness = null
})

async function setup(options: Parameters<typeof createHarness>[0] = {}): Promise<Harness> {
	harness = await createHarness(options)
	return harness
}

async function exists(path: string): Promise<boolean> {
	return Bun.file(path).exists()
}

describe('DownloadEngine', () => {
	test('downloads a small file and removes the part file', async () => {
		const body = makeBody(1000)
		const h = await setup({ origin: { body } })
		const queued = await h.enqueue('/file')
		expect(await h.run(queued.id)).toEqual({ kind: 'completed' })
		const done = h.context.downloads.require(queued.id)
		expect(done.status).toBe('completed')
		expect(done.downloadedBytes).toBe(1000)
		expect(done.totalBytes).toBe(1000)
		expect(await hashFile(done.destination)).toBe(sha256Hex(body))
		expect(await exists(partPathFor(done.destination))).toBe(false)
	})

	test('downloads large files in parallel segments', async () => {
		const body = makeBody(MULTI_SEGMENT_SIZE)
		const h = await setup({ origin: { body } })
		const queued = await h.enqueue('/file')
		expect((await h.run(queued.id)).kind).toBe('completed')
		const done = h.context.downloads.require(queued.id)
		expect(await hashFile(done.destination)).toBe(sha256Hex(body))
		const rows = h.context.segments.list(queued.id)
		expect(rows).toHaveLength(4)
		expect(rows.every((row) => row.status === 'completed' && row.durableOffset === row.endOffset + 1)).toBe(true)
		const ranges = new Set(h.origin.requests.filter((request) => request.method === 'GET' && request.range !== 'bytes=0-0').map((request) => request.range))
		expect(ranges.size).toBe(4)
	})

	test('falls back to a single stream when the server ignores ranges', async () => {
		const body = makeBody(3 * 1024 * 1024)
		const h = await setup({ origin: { body, ranges: 'ignore' } })
		const queued = await h.enqueue('/file')
		expect((await h.run(queued.id)).kind).toBe('completed')
		expect(await hashFile(h.context.downloads.require(queued.id).destination)).toBe(sha256Hex(body))
		const lastGet = h.origin.requests.filter((request) => request.method === 'GET').at(-1)
		expect(lastGet?.range).toBeNull()
	})

	test('falls back to a single stream when Content-Range is invalid', async () => {
		const body = makeBody(2 * 1024 * 1024)
		const h = await setup({ origin: { body, ranges: 'bad-content-range' } })
		const queued = await h.enqueue('/file')
		expect((await h.run(queued.id)).kind).toBe('completed')
		expect(await hashFile(h.context.downloads.require(queued.id).destination)).toBe(sha256Hex(body))
	})

	test('follows redirects and names files from Content-Disposition without overwriting', async () => {
		const body = makeBody(500)
		const h = await setup({ origin: { body, disposition: 'attachment; filename="report.pdf"' } })
		const first = await h.enqueue('/redirect')
		const second = await h.enqueue('/redirect')
		expect((await h.run(first.id)).kind).toBe('completed')
		expect((await h.run(second.id)).kind).toBe('completed')
		expect(h.context.downloads.require(first.id).filename).toBe('report.pdf')
		expect(h.context.downloads.require(second.id).filename).toBe('report (1).pdf')
		expect(await exists(join(h.downloadDir, 'report.pdf'))).toBe(true)
		expect(await exists(join(h.downloadDir, 'report (1).pdf'))).toBe(true)
	})

	test('retries transient server errors', async () => {
		const body = makeBody(2000)
		const h = await setup({ origin: { body, failures: { status: 503, remaining: 2 } } })
		const queued = await h.enqueue('/file')
		expect((await h.run(queued.id)).kind).toBe('completed')
		expect(await hashFile(h.context.downloads.require(queued.id).destination)).toBe(sha256Hex(body))
	})

	test('gives up after the retry limit on persistent server errors', async () => {
		const h = await setup({ origin: { failures: { status: 503, remaining: 1000 } } })
		const queued = await h.enqueue('/file')
		const outcome = await h.run(queued.id)
		expect(outcome).toMatchObject({ kind: 'failed', code: 'http_503' })
		const failed = h.context.downloads.require(queued.id)
		expect(failed.status).toBe('failed')
		expect(failed.errorCode).toBe('http_503')
		expect(h.origin.requests).toHaveLength(6)
	})

	test('does not retry permanent errors', async () => {
		const h = await setup()
		const queued = await h.enqueue('/missing')
		expect(await h.run(queued.id)).toMatchObject({ kind: 'failed', code: 'http_404' })
		expect(h.origin.requests).toHaveLength(2)
	})

	describe('resuming', () => {
		async function seedInterrupted(h: Harness, body: Uint8Array, durable: number) {
			const queued = await h.enqueue('/file')
			const plan = planSegments(body.length, 4)
			h.context.downloads.setStatus(queued.id, 'probing')
			h.context.downloads.setStatus(queued.id, 'downloading', { totalBytes: body.length, etag: '"v1"', lastModified: h.origin.state.lastModified })
			const rows = h.context.segments.replace(queued.id, plan)
			const first = rows[0]
			if (first === undefined) throw new Error('segment missing')
			h.context.segments.saveDurable([{ id: first.id, durableOffset: first.startOffset + durable, status: 'active' }])
			const partial = new Uint8Array(body.length)
			partial.set(body.subarray(0, durable))
			await Bun.write(partPathFor(queued.destination), partial)
			h.context.downloads.setStatus(queued.id, 'queued', { downloadedBytes: durable })
			return { id: queued.id, firstEnd: first.endOffset }
		}

		test('continues from the durable offset when the remote file is unchanged', async () => {
			const body = makeBody(MULTI_SEGMENT_SIZE)
			const h = await setup({ origin: { body } })
			const { id, firstEnd } = await seedInterrupted(h, body, 500_000)
			expect((await h.run(id)).kind).toBe('completed')
			expect(await hashFile(h.context.downloads.require(id).destination)).toBe(sha256Hex(body))
			const ranges = h.origin.requests.map((request) => request.range)
			expect(ranges).toContain(`bytes=500000-${firstEnd}`)
			expect(ranges).not.toContain(`bytes=0-${firstEnd}`)
		})

		test('restarts cleanly when the ETag changed since the partial download', async () => {
			const original = makeBody(MULTI_SEGMENT_SIZE, 1)
			const replacement = makeBody(MULTI_SEGMENT_SIZE, 2)
			const h = await setup({ origin: { body: original } })
			const { id } = await seedInterrupted(h, original, 500_000)
			h.origin.state.body = replacement
			h.origin.state.etag = '"v2"'
			expect((await h.run(id)).kind).toBe('completed')
			const done = h.context.downloads.require(id)
			expect(await hashFile(done.destination)).toBe(sha256Hex(replacement))
			expect(done.etag).toBe('"v2"')
			expect(h.origin.requests.some((request) => request.range?.startsWith('bytes=500000-'))).toBe(false)
		})
	})

	test('restarts when the remote file changes during the transfer', async () => {
		const original = makeBody(MULTI_SEGMENT_SIZE, 1)
		const replacement = makeBody(MULTI_SEGMENT_SIZE, 2)
		const h = await setup({ origin: { body: original } })
		h.origin.state.onRequest = (count) => {
			if (count === 3) {
				h.origin.state.body = replacement
				h.origin.state.etag = '"v2"'
			}
		}
		const queued = await h.enqueue('/file')
		expect((await h.run(queued.id)).kind).toBe('completed')
		const done = h.context.downloads.require(queued.id)
		expect(await hashFile(done.destination)).toBe(sha256Hex(replacement))
		expect(done.etag).toBe('"v2"')
	})

	describe('checksum verification', () => {
		test('records the digest when it matches', async () => {
			const body = makeBody(3000)
			const h = await setup({ origin: { body } })
			const queued = await h.enqueue('/file', { expectedSha256: sha256Hex(body).toUpperCase() })
			expect((await h.run(queued.id)).kind).toBe('completed')
			expect(h.context.downloads.require(queued.id).actualSha256).toBe(sha256Hex(body))
		})

		test('rejects a mismatch and leaves no file behind', async () => {
			const h = await setup({ origin: { body: makeBody(3000) } })
			const queued = await h.enqueue('/file', { expectedSha256: 'a'.repeat(64) })
			expect(await h.run(queued.id)).toMatchObject({ kind: 'failed', code: 'checksum_mismatch' })
			const failed = h.context.downloads.require(queued.id)
			expect(failed.status).toBe('failed')
			expect(failed.actualSha256).toBe(sha256Hex(makeBody(3000)))
			expect(await exists(failed.destination)).toBe(false)
			expect(await exists(partPathFor(failed.destination))).toBe(false)
		})
	})

	describe('network safety', () => {
		test('refuses private destinations by default without contacting them', async () => {
			const h = await setup({ allowed: [] })
			const queued = await h.enqueue('/file')
			expect(await h.run(queued.id)).toMatchObject({ kind: 'failed', code: 'blocked_destination' })
			expect(h.origin.requests).toHaveLength(0)
		})

		test('refuses redirects into private networks', async () => {
			const h = await setup()
			const queued = await h.enqueue('/redirect-private')
			expect(await h.run(queued.id)).toMatchObject({ kind: 'failed', code: 'blocked_destination' })
		})
	})

	test('reports an abort and leaves the download in its active status', async () => {
		const h = await setup()
		const queued = await h.enqueue('/file')
		const controller = new AbortController()
		controller.abort()
		expect(await h.run(queued.id, controller.signal)).toEqual({ kind: 'aborted' })
		expect(h.context.downloads.require(queued.id).status).toBe('probing')
	})

	test('refuses to run a download that is not queued', async () => {
		const h = await setup({ origin: { body: makeBody(100) } })
		const queued = await h.enqueue('/file')
		await h.run(queued.id)
		expect(await h.run(queued.id)).toMatchObject({ kind: 'failed', code: 'invalid_state' })
		expect(h.context.downloads.require(queued.id).status).toBe('completed')
	})
})
