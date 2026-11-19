import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { DownloadsRepository } from '../../src/database/downloads-repository'
import type { DownloadRecord } from '../../src/downloads/domain/records'
import type { RunOutcome } from '../../src/downloads/engine/engine'
import { DownloadScheduler } from '../../src/downloads/scheduler/scheduler'
import type { DownloadRunner } from '../../src/downloads/scheduler/scheduler'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'
import { waitFor } from '../helpers/wait'

/**
 * Finishes at once. The scheduler only looks at the record's final status,
 * so the outcome it returns is the same either way.
 */
class InstantRunner implements DownloadRunner {
	constructor(private readonly downloads: DownloadsRepository, private readonly finish: 'completed' | 'failed') { }

	async run(id: string): Promise<RunOutcome> {
		this.downloads.setStatus(id, 'probing')
		this.downloads.setStatus(id, 'downloading')
		if (this.finish === 'failed') this.downloads.setStatus(id, 'failed', { errorCode: 'http_503', errorMessage: 'unavailable' })
		else this.downloads.setStatus(id, 'completed')
		return { kind: 'completed' }
	}
}

class WaitingRunner implements DownloadRunner {
	constructor(private readonly downloads: DownloadsRepository) { }

	async run(id: string, signal: AbortSignal): Promise<RunOutcome> {
		this.downloads.setStatus(id, 'probing')
		this.downloads.setStatus(id, 'downloading')
		await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
		return { kind: 'aborted' }
	}
}

let context: TestContext

beforeEach(async () => {
	context = await createTestContext()
})

afterEach(async () => {
	await context.dispose()
})

function createScheduler(runner: DownloadRunner, onFinished: (record: DownloadRecord) => void): DownloadScheduler {
	return new DownloadScheduler({ downloads: context.downloads, segments: context.segments, runner, onFinished }, { maxConcurrentDownloads: 1, downloadDirectory: context.directory })
}

function enqueue(name: string) {
	return context.downloads.create({ url: `https://example.test/${name}`, filename: name, destination: join(context.directory, name) })
}

describe('DownloadScheduler onFinished', () => {
	test('reports a completed download', async () => {
		const finished: DownloadRecord[] = []
		const scheduler = createScheduler(new InstantRunner(context.downloads, 'completed'), (record) => { finished.push(record) })
		const download = enqueue('a.bin')
		scheduler.start()
		await waitFor(() => finished.length === 1)
		expect(finished[0]?.id).toBe(download.id)
		expect(finished[0]?.status).toBe('completed')
	})

	test('reports a failed download with its error', async () => {
		const finished: DownloadRecord[] = []
		const scheduler = createScheduler(new InstantRunner(context.downloads, 'failed'), (record) => { finished.push(record) })
		enqueue('a.bin')
		scheduler.start()
		await waitFor(() => finished.length === 1)
		expect(finished[0]?.status).toBe('failed')
		expect(finished[0]?.errorCode).toBe('http_503')
	})

	test('stays quiet when a download is paused', async () => {
		const finished: DownloadRecord[] = []
		const scheduler = createScheduler(new WaitingRunner(context.downloads), (record) => { finished.push(record) })
		const download = enqueue('a.bin')
		scheduler.start()
		await waitFor(() => context.downloads.require(download.id).status === 'downloading')
		await scheduler.pause(download.id)
		expect(finished).toEqual([])
	})

	test('a failing callback does not stop the next download', async () => {
		const seen: string[] = []
		const original = console.error
		console.error = () => undefined
		try {
			const scheduler = createScheduler(new InstantRunner(context.downloads, 'completed'), (record) => {
				seen.push(record.id)
				if (seen.length === 1) throw new Error('boom')
			})
			const first = enqueue('1.bin')
			const second = enqueue('2.bin')
			scheduler.start()
			await waitFor(() => seen.length === 2)
			expect([...seen].sort()).toEqual([first.id, second.id].sort())
		} finally {
			console.error = original
		}
	})
})
