import { rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import type { AppConfig, RetryPolicy } from '../../config/config'
import type { DownloadsRepository } from '../../database/downloads-repository'
import type { SegmentsRepository } from '../../database/segments-repository'
import { allocateDestination, withDestinationLock } from '../../filesystem/destination'
import { DestinationExistsError } from '../../filesystem/errors'
import { sanitizeFilename } from '../../filesystem/filename'
import { finalizePartFile } from '../../filesystem/finalize'
import { partPathFor } from '../../filesystem/paths'
import { fileSize } from '../../filesystem/stat'
import type { DownloadRecord, SegmentRecord } from '../domain/records'
import { isActiveStatus } from '../domain/status'
import { BlockedDestinationError, ChecksumMismatchError, HttpStatusError, IncompleteResponseError, InvalidRangeResponseError, RemoteChangedError, ResolverError, TooManyRedirectsError, UnsupportedUrlError } from '../http/errors'
import type { GuardedFetch } from '../http/guarded-fetch'
import type { ResolverRegistry } from '../resolvers/registry'
import type { ResolverContext } from '../resolvers/types'
import type { Semaphore } from '../scheduler/semaphore'
import { coversExactly, durableBytes, isSegmentComplete, planSegments } from '../segments/plan'
import { hashFile } from '../verification/sha256'
import { PartFile } from './part-file'
import { probeSource } from './probe'
import type { ProbeResult } from './probe'
import { ProgressTracker } from './progress'
import { withRetry } from './retry'
import { downloadSegment, downloadSingleStream, noThrottle, validatorFor } from './transfer'
import type { SegmentTransferContext, Throttle, TransferContext } from './transfer'

const MAX_RESTARTS = 2

export interface EngineOptions {
	readonly maxSegments: number
	readonly retry: RetryPolicy
	readonly persistIntervalMs: number
	/** Longest time a response body may stay silent before the request is dropped. */
	readonly idleTimeoutMs: number
}

export function engineOptionsFromConfig(config: AppConfig): EngineOptions {
	return {
		maxSegments: config.maxSegments,
		retry: config.retry,
		persistIntervalMs: config.persistIntervalMs,
		idleTimeoutMs: config.requestTimeoutMs
	}
}

export interface EngineDependencies {
	readonly downloads: DownloadsRepository
	readonly segments: SegmentsRepository
	readonly resolvers: ResolverRegistry
	readonly fetch: GuardedFetch
	readonly throttle?: Throttle
	/** Limits how many segments transfer at once across all downloads. */
	readonly segmentGate?: Semaphore
}

/**
 * - `completed`: the file is verified and at its final path.
 * - `aborted`: the signal fired. Offsets were flushed, and the download is
 *   left in its active status. The caller moves it to paused, cancelled or
 *   queued, depending on why it aborted.
 * - `failed`: a permanent failure was recorded on the download.
 */
export type RunOutcome =
	| { readonly kind: 'completed' }
	| { readonly kind: 'aborted' }
	| { readonly kind: 'failed'; readonly code: string; readonly message: string }

interface Failure {
	readonly code: string
	readonly message: string
}

/**
 * Describes errors the engine understands, in terms safe to show to users.
 * Returns null for anything else.
 */
export function describeKnownFailure(error: unknown): Failure | null {
	if (error instanceof HttpStatusError) return { code: `http_${error.status}`, message: error.message }
	if (error instanceof BlockedDestinationError) return { code: 'blocked_destination', message: error.message }
	if (error instanceof ChecksumMismatchError) return { code: 'checksum_mismatch', message: error.message }
	if (error instanceof ResolverError) return { code: 'resolver_failed', message: error.message }
	if (error instanceof UnsupportedUrlError) return { code: 'unsupported_url', message: error.message }
	if (error instanceof TooManyRedirectsError) return { code: 'too_many_redirects', message: error.message }
	if (error instanceof InvalidRangeResponseError) return { code: 'invalid_range', message: error.message }
	if (error instanceof RemoteChangedError) return { code: 'remote_changed', message: error.message }
	if (error instanceof IncompleteResponseError) return { code: 'incomplete', message: error.message }
	if (error instanceof DestinationExistsError) return { code: 'destination_exists', message: error.message }
	if (error instanceof DOMException && error.name === 'TimeoutError') return { code: 'timeout', message: 'The server did not respond in time' }
	return null
}

function parseDownloadUrl(text: string): URL {
	try { return new URL(text) } catch { throw new UnsupportedUrlError('The download URL is not valid') }
}

/**
 * True when what the server offers now differs from what a partial download
 * was started against. A stored validator that the server no longer provides
 * counts as a change, because the partial data can no longer be trusted.
 */
function remoteChanged(record: DownloadRecord, probe: ProbeResult): boolean {
	if (record.totalBytes !== null && probe.totalBytes !== null && record.totalBytes !== probe.totalBytes) return true
	if (record.etag !== null && record.etag !== probe.etag) return true
	if (record.lastModified !== null && record.lastModified !== probe.lastModified) return true
	return false
}

/**
 * Runs a single download from `queued` to `completed`.
 *
 * Steps: resolve the URL, probe the server, discard partial data if the
 * remote file changed, choose ranged or single-stream mode, transfer, verify
 * the optional SHA-256, then move the part file to its final name without
 * overwriting anything.
 *
 * Ranged mode splits the file into up to `maxSegments` segments that write to
 * one preallocated part file in parallel. Progress is persisted in batches,
 * always after the data is flushed to disk. Single-stream mode is used when
 * the server does not prove range support, or when a ranged transfer turns
 * out to be unreliable.
 *
 * If the remote file changes mid-transfer, all partial data is discarded and
 * the download restarts (at most twice).
 */
export class DownloadEngine {
	constructor(private readonly deps: EngineDependencies, private readonly options: EngineOptions) { }

	async run(id: string, signal: AbortSignal): Promise<RunOutcome> {
		const initial = this.deps.downloads.require(id)
		if (initial.status !== 'queued') return { kind: 'failed', code: 'invalid_state', message: `Only queued downloads can be started (status: ${initial.status})` }
		let restarts = 0
		let forceStream = false
		for (; ;) {
			try {
				return await this.attempt(id, signal, forceStream)
			} catch (error) {
				if (signal.aborted) return { kind: 'aborted' }
				if (error instanceof InvalidRangeResponseError && !forceStream) {
					forceStream = true
					await this.resetForRestart(id)
					continue
				}
				if (error instanceof RemoteChangedError && restarts < MAX_RESTARTS) {
					restarts += 1
					await this.resetForRestart(id)
					continue
				}
				return this.fail(id, error)
			}
		}
	}

	private async attempt(id: string, signal: AbortSignal, forceStream: boolean): Promise<RunOutcome> {
		const { downloads, segments } = this.deps
		const url = parseDownloadUrl(downloads.require(id).url)
		downloads.setStatus(id, 'probing', { errorCode: null, errorMessage: null, speedBytesPerSecond: 0, etaSeconds: null })
		const context: ResolverContext = { fetch: this.deps.fetch, signal }
		const { source, probe } = await withRetry(async () => {
			const resolved = await this.deps.resolvers.resolve(url, context)
			return { source: resolved, probe: await probeSource(resolved, context) }
		}, this.options.retry, { signal })
		let record = downloads.require(id)
		const existing = segments.list(id)
		const hadProgress = existing.some((segment) => durableBytes(segment) > 0)
		const rangedTotal = !forceStream && probe.acceptsRanges && probe.totalBytes !== null && probe.totalBytes > 0 ? probe.totalBytes : null
		const resumable = hadProgress && rangedTotal !== null && !remoteChanged(record, probe) && coversExactly(existing, rangedTotal) && (await fileSize(partPathFor(record.destination))) === rangedTotal
		if (hadProgress && !resumable) {
			await this.discardProgress(record)
			record = downloads.require(id)
		}
		if (!resumable) record = await this.adoptFilename(record, probe.filename)
		const partPath = partPathFor(record.destination)
		downloads.setStatus(id, 'downloading', { totalBytes: probe.totalBytes, etag: probe.etag, lastModified: probe.lastModified, resolver: source.resolver, resolvedUrl: probe.finalUrl, resolvedMetadata: JSON.stringify({ host: new URL(probe.finalUrl).host }) })
		const rows: readonly SegmentRecord[] = rangedTotal !== null ? resumable ? existing : segments.replace(id, planSegments(rangedTotal, this.options.maxSegments)) : segments.replace(id, probe.totalBytes !== null && probe.totalBytes > 0 ? planSegments(probe.totalBytes, 1) : [])
		const initialBytes = resumable ? rows.reduce((sum, row) => sum + durableBytes(row), 0) : 0
		const file = await PartFile.open(partPath, { size: rangedTotal, reset: !resumable })
		const work = new AbortController()
		const tracker = new ProgressTracker({
			downloadId: id,
			totalBytes: probe.totalBytes,
			intervalMs: this.options.persistIntervalMs,
			trackSegments: rangedTotal !== null,
			downloads,
			segments,
			syncFile: () => file.sync(),
			onFailure: (error) => work.abort(error)
		}, rows, initialBytes)
		const transfer: TransferContext = {
			url: probe.finalUrl,
			headers: probe.headers,
			fetch: this.deps.fetch,
			retry: this.options.retry,
			idleTimeoutMs: this.options.idleTimeoutMs,
			throttle: this.deps.throttle ?? noThrottle,
			signal: AbortSignal.any([signal, work.signal]),
			file,
			tracker,
			onRetry: (segmentId, error) => this.recordRetry(id, segmentId, error)
		}
		let size = 0
		tracker.start()
		try {
			if (rangedTotal !== null) {
				await this.runSegments(rows, { ...transfer, validator: validatorFor(probe.etag, probe.lastModified), totalBytes: rangedTotal }, work)
				size = rangedTotal
			} else {
				size = await downloadSingleStream(transfer, probe.totalBytes)
				await file.truncate(size)
			}
		} finally {
			await tracker.stop()
			await file.close()
		}
		return await this.finish(id, record, size, signal)
	}

	private async runSegments(rows: readonly SegmentRecord[], context: SegmentTransferContext, work: AbortController): Promise<void> {
		const outcome: { failed: boolean; error: unknown } = { failed: false, error: undefined }
		await Promise.all(rows.filter((row) => !isSegmentComplete(row)).map(async (segment) => {
			try {
				const release = await (this.deps.segmentGate?.acquire(context.signal) ?? Promise.resolve((): void => undefined))
				try { await downloadSegment(segment, context) } finally { release() }
			} catch (error) {
				if (!outcome.failed) {
					outcome.failed = true
					outcome.error = error
				}
				work.abort(error)
			}
		}))
		if (outcome.failed) throw outcome.error
	}

	private async finish(id: string, record: DownloadRecord, size: number, signal: AbortSignal): Promise<RunOutcome> {
		const { downloads } = this.deps
		const partPath = partPathFor(record.destination)
		let actual: string | null = null
		if (record.expectedSha256 !== null) {
			downloads.setStatus(id, 'verifying', { downloadedBytes: size, totalBytes: size })
			actual = await hashFile(partPath, signal)
			if (actual !== record.expectedSha256.toLowerCase()) {
				downloads.update(id, { actualSha256: actual })
				await this.discardProgress(downloads.require(id))
				throw new ChecksumMismatchError(record.expectedSha256, actual)
			}
		}
		const destination = await this.finalize(record, partPath)
		downloads.setStatus(id, 'completed', { downloadedBytes: size, totalBytes: size, actualSha256: actual, speedBytesPerSecond: 0, etaSeconds: 0, filename: basename(destination), destination })
		return { kind: 'completed' }
	}

	private async finalize(record: DownloadRecord, partPath: string): Promise<string> {
		try {
			await finalizePartFile(partPath, record.destination)
			return record.destination
		} catch (error) {
			if (!(error instanceof DestinationExistsError)) throw error
			return withDestinationLock(async () => {
				const destination = await allocateDestination(
					dirname(record.destination),
					basename(record.destination),
					this.reservedDestinations(record.id)
				)
				await finalizePartFile(partPath, destination)
				this.deps.downloads.update(record.id, { filename: basename(destination), destination })
				return destination
			})
		}
	}

	private async adoptFilename(record: DownloadRecord, serverName: string | null): Promise<DownloadRecord> {
		if (serverName === null) return record
		const name = sanitizeFilename(serverName)
		if (name === record.filename) return record
		return withDestinationLock(async () => {
			const destination = await allocateDestination(dirname(record.destination), name, this.reservedDestinations(record.id))
			if (destination === record.destination) return record
			await rm(partPathFor(record.destination), { force: true })
			return this.deps.downloads.update(record.id, { filename: basename(destination), destination })
		})
	}

	private reservedDestinations(excludeId: string): string[] {
		return this.deps.downloads.list().filter((other) => other.id !== excludeId).map((other) => other.destination)
	}

	private async discardProgress(record: DownloadRecord): Promise<void> {
		await rm(partPathFor(record.destination), { force: true })
		this.deps.segments.deleteFor(record.id)
		this.deps.downloads.update(record.id, { downloadedBytes: 0, etag: null, lastModified: null })
	}

	private async resetForRestart(id: string): Promise<void> {
		const record = this.deps.downloads.require(id)
		await this.discardProgress(record)
		if (isActiveStatus(record.status)) this.deps.downloads.setStatus(id, 'queued', { speedBytesPerSecond: 0, etaSeconds: null, actualSha256: null, errorCode: null, errorMessage: null })
	}

	private recordRetry(id: string, segmentId: number | null, error: unknown): void {
		const message = describeKnownFailure(error)?.message ?? 'A transient error occurred'
		if (segmentId !== null) this.deps.segments.recordRetry(segmentId, message)
		const current = this.deps.downloads.require(id)
		this.deps.downloads.update(id, { retryCount: current.retryCount + 1 })
	}

	private fail(id: string, error: unknown): RunOutcome {
		const known = describeKnownFailure(error)
		if (known === null) console.error('[wayfarer] unexpected download error', error)
		const failure = known ?? { code: 'download_failed', message: 'The download failed unexpectedly' }
		const current = this.deps.downloads.require(id)
		if (isActiveStatus(current.status)) this.deps.downloads.setStatus(id, 'failed', { errorCode: failure.code, errorMessage: failure.message, speedBytesPerSecond: 0, etaSeconds: null })
		return { kind: 'failed', code: failure.code, message: failure.message }
	}
}
