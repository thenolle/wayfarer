import { join } from 'node:path'
import type { RetryPolicy } from '../../src/config/config'
import type { DownloadRecord } from '../../src/downloads/domain/records'
import { DownloadEngine } from '../../src/downloads/engine/engine'
import type { RunOutcome } from '../../src/downloads/engine/engine'
import { createGuardedFetch } from '../../src/downloads/http/guarded-fetch'
import { createDefaultResolvers } from '../../src/downloads/resolvers/registry'
import { BandwidthLimiter } from '../../src/downloads/scheduler/bandwidth-limiter'
import { DownloadScheduler } from '../../src/downloads/scheduler/scheduler'
import { Semaphore } from '../../src/downloads/scheduler/semaphore'
import { allocateDestination } from '../../src/filesystem/destination'
import { ensureDirectories } from '../../src/filesystem/paths'
import { NetworkPolicy } from '../../src/security/network-policy'
import { createTestContext } from './fixtures'
import type { TestContext } from './fixtures'
import { startOrigin } from './origin'
import type { OriginState, TestOrigin } from './origin'

const TEST_RETRY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, jitterRatio: 0 }

export interface HarnessOptions {
	readonly origin?: Partial<OriginState>
	readonly allowed?: readonly string[]
	readonly maxSegments?: number
	readonly maxConcurrentDownloads?: number
	readonly bandwidthLimit?: number
}

export interface EnqueueOptions {
	readonly filename?: string
	readonly expectedSha256?: string
}

export interface Harness {
	readonly context: TestContext
	readonly origin: TestOrigin
	readonly downloadDir: string
	readonly limiter: BandwidthLimiter
	/** The scheduler created with the harness. */
	readonly scheduler: DownloadScheduler
	/** Creates another scheduler and engine over the same database, as after a restart. */
	createScheduler(): DownloadScheduler
	enqueue(path: string, options?: EnqueueOptions): Promise<DownloadRecord>
	/** Runs one queued download directly through the engine, bypassing the scheduler. */
	run(id: string, signal?: AbortSignal): Promise<RunOutcome>
	dispose(): Promise<void>
}

export function sha256Hex(bytes: Uint8Array): string {
	const hasher = new Bun.CryptoHasher('sha256')
	hasher.update(bytes)
	return hasher.digest('hex')
}

/**
 * Wires a real database, a local mock origin, the download engine and a
 * scheduler together in an isolated temporary directory.
 */
export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
	const context = await createTestContext()
	const origin = startOrigin(options.origin)
	const downloadDir = join(context.directory, 'downloads')
	await ensureDirectories(downloadDir)
	const fetch = createGuardedFetch({ policy: new NetworkPolicy(options.allowed ?? ['127.0.0.1']), headerTimeoutMs: 5000 })
	const limiter = new BandwidthLimiter(options.bandwidthLimit ?? 0)
	const gate = new Semaphore(16)
	const schedulers: DownloadScheduler[] = []
	function createEngine(): DownloadEngine {
		return new DownloadEngine({
			downloads: context.downloads,
			segments: context.segments,
			resolvers: createDefaultResolvers(),
			fetch,
			throttle: (bytes, signal) => limiter.acquire(bytes, signal),
			segmentGate: gate
		}, { maxSegments: options.maxSegments ?? 4, retry: TEST_RETRY, persistIntervalMs: 50, idleTimeoutMs: 5000 })
	}
	function createScheduler(): DownloadScheduler {
		const scheduler = new DownloadScheduler({ downloads: context.downloads, segments: context.segments, runner: createEngine() }, { maxConcurrentDownloads: options.maxConcurrentDownloads ?? 2, downloadDirectory: downloadDir })
		schedulers.push(scheduler)
		return scheduler
	}
	const engine = createEngine()
	const scheduler = createScheduler()
	return {
		context,
		origin,
		downloadDir,
		limiter,
		scheduler,
		createScheduler,
		async enqueue(path, enqueueOptions = {}) {
			const filename = enqueueOptions.filename ?? (path.split('/').filter(Boolean).at(-1) ?? 'download')
			const reserved = context.downloads.list().map((download) => download.destination)
			const destination = await allocateDestination(downloadDir, filename, reserved)
			return context.downloads.create({ url: `${origin.url}${path}`, filename, destination, ...(enqueueOptions.expectedSha256 === undefined ? {} : { expectedSha256: enqueueOptions.expectedSha256 }) })
		},
		run(id, signal = new AbortController().signal) {
			return engine.run(id, signal)
		},
		async dispose() {
			await Promise.all(schedulers.map((item) => item.shutdown()))
			await origin.stop()
			await context.dispose()
		}
	}
}
