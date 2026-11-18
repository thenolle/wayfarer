import type { AppConfig } from '../config/config'
import { closeDatabase, openDatabase } from '../database/connection'
import { DownloadsRepository } from '../database/downloads-repository'
import { SegmentsRepository } from '../database/segments-repository'
import { SettingsRepository } from '../database/settings-repository'
import { DownloadEngine, engineOptionsFromConfig } from '../downloads/engine/engine'
import { createGuardedFetch } from '../downloads/http/guarded-fetch'
import { DownloadIntake } from '../downloads/intake'
import { recoverInterruptedDownloads } from '../downloads/recovery/recover'
import type { RecoveryReport } from '../downloads/recovery/recover'
import { createDefaultResolvers } from '../downloads/resolvers/registry'
import { BandwidthLimiter } from '../downloads/scheduler/bandwidth-limiter'
import { DownloadScheduler } from '../downloads/scheduler/scheduler'
import { Semaphore } from '../downloads/scheduler/semaphore'
import { ensureDirectories } from '../filesystem/paths'
import { NetworkPolicy } from '../security/network-policy'
import { inspectLink } from '../downloads/inspect'
import type { LinkPreview } from '../downloads/inspect'

/**
 * The running application: persistence, the download engine and its scheduler,
 * wired together. Transport layers (HTTP, WebSocket) talk to this object only.
 */
export interface Runtime {
	readonly config: AppConfig
	readonly downloads: DownloadsRepository
	readonly segments: SegmentsRepository
	readonly settings: SettingsRepository
	readonly limiter: BandwidthLimiter
	readonly scheduler: DownloadScheduler
	readonly intake: DownloadIntake
	/**
	 * Resolves and probes a link without downloading it.
	 */
	inspect(url: string): Promise<LinkPreview>
	/**
	 * Recovers interrupted downloads, then begins scheduling.
	 */
	start(): Promise<RecoveryReport>
	/**
	 * Applies and persists a new global bandwidth limit (bytes per second, 0 for
	 * unlimited).
	 *
	 * @throws {RangeError} when the value is not a non-negative integer.
	 */
	setBandwidthLimit(bytesPerSecond: number): void
	/**
	 * Graceful shutdown: stop accepting downloads, stop scheduling, abort
	 * requests, wait for writes to settle, flush files and store durable
	 * offsets (all done by the engine as each download stops), then checkpoint
	 * the SQLite WAL and close the database. Safe to call more than once.
	 */
	shutdown(): Promise<void>
}

export async function createRuntime(config: AppConfig): Promise<Runtime> {
	await ensureDirectories(config.dataDirectory, config.downloadDirectory)
	const database = openDatabase(config.databasePath)
	const downloads = new DownloadsRepository(database)
	const segments = new SegmentsRepository(database)
	const settings = new SettingsRepository(database)
	const limiter = new BandwidthLimiter(settings.getBandwidthLimit() ?? config.bandwidthLimitBytesPerSecond)
	const fetch = createGuardedFetch({ policy: new NetworkPolicy(config.allowedPrivateNetworks), headerTimeoutMs: config.requestTimeoutMs })
	const resolvers = createDefaultResolvers()
	const engine = new DownloadEngine({ downloads, segments, resolvers, fetch, throttle: (bytes, signal) => limiter.acquire(bytes, signal), segmentGate: new Semaphore(config.maxConcurrentSegments) }, engineOptionsFromConfig(config))
	const scheduler = new DownloadScheduler({ downloads, segments, runner: engine }, { maxConcurrentDownloads: config.maxConcurrentDownloads, downloadDirectory: config.downloadDirectory, extraRoots: config.locations.map((location) => location.path) })
	const intake = new DownloadIntake({ downloads, downloadDir: config.downloadDirectory, locations: config.locations, isAccepting: () => scheduler.accepting, onAdded: () => scheduler.notify() })
	let stopping: Promise<void> | null = null
	return {
		config,
		downloads,
		segments,
		settings,
		limiter,
		scheduler,
		intake,
		inspect: (url) => inspectLink(url, { resolvers, fetch, timeoutMs: config.requestTimeoutMs }),
		async start() {
			const report = await recoverInterruptedDownloads(downloads, segments)
			scheduler.start()
			return report
		},
		setBandwidthLimit(bytesPerSecond) {
			limiter.setLimit(bytesPerSecond)
			settings.setBandwidthLimit(bytesPerSecond)
		},
		shutdown() {
			stopping ??= (async () => {
				await scheduler.shutdown()
				closeDatabase(database)
			})()
			return stopping
		}
	}
}
