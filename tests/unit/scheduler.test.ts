import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { DownloadsRepository } from '../../src/database/downloads-repository'
import { InvalidTransitionError } from '../../src/downloads/domain/errors'
import { InvalidDownloadError } from '../../src/downloads/domain/validation'
import type { RunOutcome } from '../../src/downloads/engine/engine'
import { DownloadScheduler } from '../../src/downloads/scheduler/scheduler'
import type { DownloadRunner } from '../../src/downloads/scheduler/scheduler'
import { partPathFor } from '../../src/filesystem/paths'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'
import { waitFor } from '../helpers/wait'

class FakeRunner implements DownloadRunner {
	readonly started: string[] = []
	peak = 0
	private active = 0
	private readonly releases = new Map<string, () => void>()

	constructor(private readonly downloads: DownloadsRepository) { }

	async run(id: string, signal: AbortSignal): Promise<RunOutcome> {
		this.started.push(id)
		this.active += 1
		this.peak = Math.max(this.peak, this.active)
		this.downloads.setStatus(id, 'probing')
		this.downloads.setStatus(id, 'downloading')
		await new Promise<void>((resolve) => {
			this.releases.set(id, resolve)
			signal.addEventListener('abort', () => resolve(), { once: true })
		})
		this.active -= 1
		if (signal.aborted) return { kind: 'aborted' }
		this.downloads.setStatus(id, 'completed')
		return { kind: 'completed' }
	}

	release(id: string): void {
		this.releases.get(id)?.()
	}
}

let context: TestContext
let runner: FakeRunner

beforeEach(async () => {
	context = await createTestContext()
	runner = new FakeRunner(context.downloads)
})

afterEach(async () => {
	await context.dispose()
})

function createScheduler(maxConcurrentDownloads: number): DownloadScheduler {
	return new DownloadScheduler({ downloads: context.downloads, segments: context.segments, runner }, { maxConcurrentDownloads, downloadDir: context.directory })
}

function enqueue(name: string, priority: number = 0) {
	return context.downloads.create({ url: `https://example.test/${name}`, filename: name, destination: join(context.directory, name), priority })
}

function status(id: string): string {
	return context.downloads.require(id).status
}

describe('DownloadScheduler', () => {
	test('does nothing before it is started', () => {
		const scheduler = createScheduler(2)
		enqueue('a.bin')
		scheduler.notify()
		expect(runner.started).toEqual([])
	})

	test('starts downloads by priority, then by age', async () => {
		const scheduler = createScheduler(1)
		const low = enqueue('low.bin', 0)
		const high = enqueue('high.bin', 5)
		const middle = enqueue('middle.bin', 1)
		scheduler.start()
		expect(runner.started).toEqual([high.id])
		runner.release(high.id)
		await waitFor(() => runner.started.length === 2)
		expect(runner.started[1]).toBe(middle.id)
		runner.release(middle.id)
		await waitFor(() => runner.started.length === 3)
		expect(runner.started[2]).toBe(low.id)
		runner.release(low.id)
		await waitFor(() => status(low.id) === 'completed')
	})

	test('never runs more downloads than the limit', async () => {
		const scheduler = createScheduler(2)
		const ids = [1, 2, 3, 4, 5].map((n) => enqueue(`file${n}.bin`).id)
		scheduler.start()
		expect(scheduler.runningCount).toBe(2)
		for (let index = 0; index < ids.length; index += 1) {
			await waitFor(() => runner.started.length > index)
			const id = runner.started[index]
			if (id === undefined) throw new Error('missing download')
			runner.release(id)
		}
		await waitFor(() => ids.every((id) => status(id) === 'completed'))
		expect(runner.peak).toBe(2)
	})

	test('pause stops a running download and resume runs it again', async () => {
		const scheduler = createScheduler(1)
		const download = enqueue('a.bin')
		scheduler.start()
		const paused = await scheduler.pause(download.id)
		expect(paused.status).toBe('paused')
		expect(scheduler.runningCount).toBe(0)
		expect(scheduler.resume(download.id).status).toBe('queued')
		await waitFor(() => runner.started.filter((id) => id === download.id).length === 2)
	})

	test('cancel stops a running download and discards its partial data', async () => {
		const scheduler = createScheduler(1)
		const download = enqueue('a.bin')
		await Bun.write(partPathFor(download.destination), 'partial')
		scheduler.start()
		const cancelled = await scheduler.cancel(download.id)
		expect(cancelled.status).toBe('cancelled')
		expect(await Bun.file(partPathFor(download.destination)).exists()).toBe(false)
	})

	test('queued, paused and finished downloads follow the state machine', async () => {
		const scheduler = createScheduler(1)
		const running = enqueue('running.bin')
		const queued = enqueue('queued.bin')
		const waiting = enqueue('waiting.bin')
		scheduler.start()
		expect((await scheduler.pause(waiting.id)).status).toBe('paused')
		expect((await scheduler.pause(waiting.id)).status).toBe('paused')
		expect((await scheduler.cancel(queued.id)).status).toBe('cancelled')
		runner.release(running.id)
		await waitFor(() => status(running.id) === 'completed')
		expect(scheduler.cancel(running.id)).rejects.toBeInstanceOf(InvalidTransitionError)
		expect(scheduler.pause(running.id)).rejects.toBeInstanceOf(InvalidTransitionError)
	})

	test('resume clears a failed download so it can be retried', () => {
		const scheduler = createScheduler(1)
		const download = enqueue('a.bin')
		context.downloads.setStatus(download.id, 'probing')
		context.downloads.setStatus(download.id, 'failed', { errorCode: 'http_503', errorMessage: 'unavailable' })
		context.downloads.update(download.id, { retryCount: 3 })
		const resumed = scheduler.resume(download.id)
		expect(resumed.status).toBe('queued')
		expect(resumed.errorCode).toBeNull()
		expect(resumed.retryCount).toBe(0)
	})

	test('remove stops a running download and deletes its record', async () => {
		const scheduler = createScheduler(1)
		const download = enqueue('a.bin')
		await Bun.write(partPathFor(download.destination), 'partial')
		scheduler.start()
		expect(await scheduler.remove(download.id)).toBe(true)
		expect(context.downloads.get(download.id)).toBeNull()
		expect(await Bun.file(partPathFor(download.destination)).exists()).toBe(false)
		expect(await scheduler.remove(download.id)).toBe(false)
	})

	test('remove keeps completed files unless asked, and never deletes outside the download directory', async () => {
		const scheduler = createScheduler(1)
		const inside = enqueue('inside.bin')
		await Bun.write(inside.destination, 'data')
		context.downloads.setStatus(inside.id, 'probing')
		context.downloads.setStatus(inside.id, 'downloading')
		context.downloads.setStatus(inside.id, 'completed')
		await scheduler.remove(inside.id)
		expect(await Bun.file(inside.destination).exists()).toBe(true)
		const kept = enqueue('delete-me.bin')
		await Bun.write(kept.destination, 'data')
		context.downloads.setStatus(kept.id, 'probing')
		context.downloads.setStatus(kept.id, 'downloading')
		context.downloads.setStatus(kept.id, 'completed')
		await scheduler.remove(kept.id, { deleteFile: true })
		expect(await Bun.file(kept.destination).exists()).toBe(false)
		const outsidePath = join(context.directory, '..', `outside-${crypto.randomUUID()}.bin`)
		await Bun.write(outsidePath, 'data')
		const outside = context.downloads.create({ url: 'https://example.test/outside.bin', filename: 'outside.bin', destination: outsidePath })
		context.downloads.setStatus(outside.id, 'probing')
		context.downloads.setStatus(outside.id, 'downloading')
		context.downloads.setStatus(outside.id, 'completed')
		await scheduler.remove(outside.id, { deleteFile: true })
		expect(await Bun.file(outsidePath).exists()).toBe(true)
		await Bun.file(outsidePath).delete()
	})

	test('shutdown requeues running downloads and refuses new work', async () => {
		const scheduler = createScheduler(2)
		const ids = [1, 2, 3].map((n) => enqueue(`file${n}.bin`).id)
		scheduler.start()
		expect(runner.started).toHaveLength(2)
		const stopping = scheduler.shutdown()
		expect(scheduler.shutdown()).toBe(stopping)
		await stopping
		expect(scheduler.accepting).toBe(false)
		expect(ids.map(status)).toEqual(['queued', 'queued', 'queued'])
		expect(runner.started).toHaveLength(2)
		expect(scheduler.runningCount).toBe(0)
	})

	test('validates priorities', () => {
		const scheduler = createScheduler(1)
		const download = enqueue('a.bin')
		expect(scheduler.setPriority(download.id, 7).priority).toBe(7)
		expect(() => scheduler.setPriority(download.id, 101)).toThrow(InvalidDownloadError)
		expect(() => scheduler.setPriority(download.id, 1.5)).toThrow(InvalidDownloadError)
	})
})
