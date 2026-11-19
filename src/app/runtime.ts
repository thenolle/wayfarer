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
import { isInside, LocationStore } from '../filesystem/location-store'
import { ensureDirectories } from '../filesystem/paths'
import { NetworkPolicy } from '../security/network-policy'
import { inspectLink } from '../downloads/inspect'
import type { LinkPreview } from '../downloads/inspect'
import type { DownloadRecord } from '../downloads/domain/records'
import { WebhookNotifier } from '../downloads/webhook'
import { RetentionSweeper } from '../downloads/retention'

/**
 * The running application: persistence, the download engine and its scheduler,
 * wired together. Transport layers (HTTP, WebSocket) talk to this object only.
 */
export interface Runtime {
	readonly config: AppConfig
	readonly downloads: DownloadsRepository
	readonly segments: SegmentsRepository
	readonly settings: SettingsRepository
	readonly locations: LocationStore
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
	const locations = new LocationStore(config.locations, settings, (directory) => downloads.list().filter((download) => isInside(directory, download.destination)).length)
	const limiter = new BandwidthLimiter(settings.getBandwidthLimit() ?? config.bandwidthLimitBytesPerSecond)
	const policy = new NetworkPolicy(config.allowedPrivateNetworks)
	const fetch = createGuardedFetch({ policy, headerTimeoutMs: config.requestTimeoutMs })
	const webhook = config.webhook === undefined || config.webhook === null ? null : new WebhookNotifier({ url: new URL(config.webhook.url), secret: config.webhook.secret }, { policy })
	const resolvers = createDefaultResolvers()
	const engine = new DownloadEngine({ downloads, segments, resolvers, fetch, throttle: (bytes, signal) => limiter.acquire(bytes, signal), segmentGate: new Semaphore(config.maxConcurrentSegments) }, engineOptionsFromConfig(config))
	const scheduler = new DownloadScheduler({ downloads, segments, runner: engine, ...(webhook === null ? {} : { onFinished: (record: DownloadRecord): void => webhook.notify(record) }) }, { maxConcurrentDownloads: config.maxConcurrentDownloads, downloadDirectory: config.downloadDirectory, extraRoots: () => locations.current().map((location) => location.path) })
	const retentionDays = config.retentionDays ?? 0
	const retention = retentionDays > 0 ? new RetentionSweeper({ downloads, scheduler }, { days: retentionDays }) : null
	const intake = new DownloadIntake({ downloads, downloadDirectory: config.downloadDirectory, locations: () => locations.current(), isAccepting: () => scheduler.accepting, onAdded: () => scheduler.notify() })
	let stopping: Promise<void> | null = null
	return {
		config,
		downloads,
		segments,
		settings,
		locations,
		limiter,
		scheduler,
		intake,
		inspect: (url) => inspectLink(url, { resolvers, fetch, timeoutMs: config.requestTimeoutMs }),
		async start() {
			const report = await recoverInterruptedDownloads(downloads, segments)
			scheduler.start()
			retention?.start()
			return report
		},
		setBandwidthLimit(bytesPerSecond) {
			limiter.setLimit(bytesPerSecond)
			settings.setBandwidthLimit(bytesPerSecond)
		},
		shutdown() {
			stopping ??= (async () => {
				await retention?.stop()
				await scheduler.shutdown()
				await webhook?.drain()
				closeDatabase(database)
			})()
			return stopping
		}
	}
}
