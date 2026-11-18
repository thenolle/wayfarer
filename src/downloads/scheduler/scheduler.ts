import { rm } from 'node:fs/promises'
import type { DownloadsRepository } from '../../database/downloads-repository'
import type { DownloadPatch } from '../../database/downloads-repository'
import type { SegmentsRepository } from '../../database/segments-repository'
import { PathEscapeError } from '../../filesystem/errors'
import { partPathFor, resolveWithin } from '../../filesystem/paths'
import type { DownloadRecord } from '../domain/records'
import { assertTransition, isActiveStatus } from '../domain/status'
import { InvalidDownloadError, isValidPriority, MAX_PRIORITY, MIN_PRIORITY } from '../domain/validation'
import type { RunOutcome } from '../engine/engine'

/**
 * Anything that can run one queued download to completion. The download
 * engine implements this; tests substitute fakes.
 */
export interface DownloadRunner {
	run(id: string, signal: AbortSignal): Promise<RunOutcome>
}

export interface SchedulerOptions {
	readonly maxConcurrentDownloads: number
	/** Only files inside this directory are ever deleted. */
	readonly downloadDirectory: string
	/** More directories whose files may be deleted, besides `downloadDir`. */
	readonly extraRoots?: readonly string[]
}

export interface SchedulerDependencies {
	readonly downloads: DownloadsRepository
	readonly segments: SegmentsRepository
	readonly runner: DownloadRunner
}

type Intent = 'pause' | 'cancel' | 'shutdown'

interface RunningDownload {
	readonly controller: AbortController
	intent: Intent | null
	done: Promise<void>
}

const IDLE: DownloadPatch = { speedBytesPerSecond: 0, etaSeconds: null }

/**
 * Starts queued downloads, highest priority first and oldest first within a
 * priority, keeping at most `maxConcurrentDownloads` running. It also owns the
 * commands that change a download's lifecycle.
 *
 * Stopping a running download aborts its signal and then waits for the engine
 * to return. The engine only returns after every request has ended, every
 * write has settled and progress has been flushed, so nothing keeps running or
 * consuming bandwidth afterwards.
 *
 * - pause: keeps the part file and segment offsets; `resume` continues later.
 * - cancel: discards the part file and segments.
 * - shutdown: requeues running downloads so the next start resumes them.
 */
export class DownloadScheduler {
	private readonly running = new Map<string, RunningDownload>()
	private started = false
	private closing = false
	private shutdownPromise: Promise<void> | null = null

	constructor(private readonly deps: SchedulerDependencies, private readonly options: SchedulerOptions) { }

	/** False once shutdown has begun; new downloads must not be accepted. */
	get accepting(): boolean {
		return !this.closing
	}

	get runningCount(): number {
		return this.running.size
	}

	start(): void {
		this.started = true
		this.pump()
	}

	/** Call after queueing work so idle capacity is used immediately. */
	notify(): void {
		this.pump()
	}

	/**
	 * Pauses a running or queued download.
	 *
	 * @throws {InvalidTransitionError} when its status does not allow pausing.
	 */
	async pause(id: string): Promise<DownloadRecord> {
		const entry = this.running.get(id)
		if (entry !== undefined) {
			await this.stopRunning(entry, 'pause')
			return this.deps.downloads.require(id)
		}
		const record = this.deps.downloads.require(id)
		if (record.status === 'paused') return record
		return this.deps.downloads.setStatus(id, 'paused', IDLE)
	}

	/**
	 * Requeues a paused or failed download. Queued and running downloads are
	 * returned unchanged.
	 *
	 * @throws {InvalidTransitionError} for completed or cancelled downloads.
	 */
	resume(id: string): DownloadRecord {
		const record = this.deps.downloads.require(id)
		if (record.status === 'queued' || isActiveStatus(record.status)) return record
		const queued = this.deps.downloads.setStatus(id, 'queued', { ...IDLE, errorCode: null, errorMessage: null, ...(record.status === 'failed' ? { retryCount: 0 } : {}) })
		this.pump()
		return queued
	}

	/**
	 * Cancels a download and discards its partial data. If the download had
	 * already finished by the time it stopped, its final status is returned.
	 *
	 * @throws {InvalidTransitionError} for completed downloads.
	 */
	async cancel(id: string): Promise<DownloadRecord> {
		const entry = this.running.get(id)
		if (entry !== undefined) {
			await this.stopRunning(entry, 'cancel')
			return this.deps.downloads.require(id)
		}
		const record = this.deps.downloads.require(id)
		if (record.status === 'cancelled') return record
		assertTransition(record.status, 'cancelled')
		await this.discardPartial(id, record.destination)
		return this.deps.downloads.setStatus(id, 'cancelled', { ...IDLE, downloadedBytes: 0 })
	}

	/**
	 * Deletes a download's record. Running downloads are stopped first and
	 * unfinished downloads lose their part file. A completed download's file is
	 * kept unless `deleteFile` is true, and is only deleted if it lies inside
	 * the download directory.
	 *
	 * Returns false when the download does not exist.
	 */
	async remove(id: string, options: { readonly deleteFile?: boolean } = {}): Promise<boolean> {
		const entry = this.running.get(id)
		if (entry !== undefined) await this.stopRunning(entry, 'cancel')
		const record = this.deps.downloads.get(id)
		if (record === null) return false
		if (record.status !== 'completed') await rm(partPathFor(record.destination), { force: true })
		else if (options.deleteFile === true) await this.deleteCompletedFile(record.destination)
		this.deps.downloads.delete(id)
		return true
	}

	/**
	 * @throws {InvalidDownloadError} when the priority is out of range.
	 */
	setPriority(id: string, priority: number): DownloadRecord {
		if (!isValidPriority(priority)) throw new InvalidDownloadError(`Priority must be an integer between ${MIN_PRIORITY} and ${MAX_PRIORITY}`)
		return this.deps.downloads.update(id, { priority })
	}

	/**
	 * Stops accepting work, aborts every running download and waits until all of
	 * them have flushed their progress and returned to the queue. Safe to call
	 * more than once.
	 */
	shutdown(): Promise<void> {
		this.shutdownPromise ??= this.performShutdown()
		return this.shutdownPromise
	}

	private async performShutdown(): Promise<void> {
		this.closing = true
		const entries = [...this.running.values()]
		for (const entry of entries) {
			if (entry.intent === null) entry.intent = 'shutdown'
			entry.controller.abort()
		}
		await Promise.all(entries.map((entry) => entry.done))
	}

	private pump(): void {
		if (!this.started || this.closing) return
		const free = this.options.maxConcurrentDownloads - this.running.size
		if (free <= 0) return
		const next = this.deps.downloads.listByStatuses(['queued']).filter((download) => !this.running.has(download.id)).slice(0, free)
		for (const download of next) this.launch(download.id)
	}

	private launch(id: string): void {
		const entry: RunningDownload = { controller: new AbortController(), intent: null, done: Promise.resolve() }
		this.running.set(id, entry)
		entry.done = this.execute(id, entry)
	}

	private async execute(id: string, entry: RunningDownload): Promise<void> {
		try {
			const outcome = await this.deps.runner.run(id, entry.controller.signal)
			await this.settle(id, entry, outcome)
		} catch (error) {
			console.error('[wayfarer] the scheduler could not finish a download', error)
			this.markFailed(id)
		} finally {
			this.running.delete(id)
			this.pump()
		}
	}

	private async settle(id: string, entry: RunningDownload, outcome: RunOutcome): Promise<void> {
		if (outcome.kind !== 'aborted') return
		const record = this.deps.downloads.get(id)
		if (record === null || !isActiveStatus(record.status)) return
		if (entry.intent === 'pause') {
			this.deps.downloads.setStatus(id, 'paused', IDLE)
		} else if (entry.intent === 'cancel') {
			await this.discardPartial(id, record.destination)
			this.deps.downloads.setStatus(id, 'cancelled', { ...IDLE, downloadedBytes: 0 })
		} else {
			this.deps.downloads.setStatus(id, 'queued', IDLE)
		}
	}

	private markFailed(id: string): void {
		try {
			const record = this.deps.downloads.get(id)
			if (record !== null && isActiveStatus(record.status)) this.deps.downloads.setStatus(id, 'failed', { ...IDLE, errorCode: 'internal_error', errorMessage: 'The download stopped because of an internal error' })
		} catch (error) {
			console.error('[wayfarer] could not record a download failure', error)
		}
	}

	private async stopRunning(entry: RunningDownload, intent: Intent): Promise<void> {
		if (entry.intent === null) {
			entry.intent = intent
			entry.controller.abort()
		}
		await entry.done
	}

	private async discardPartial(id: string, destination: string): Promise<void> {
		await rm(partPathFor(destination), { force: true })
		this.deps.segments.deleteFor(id)
	}

	private async deleteCompletedFile(destination: string): Promise<void> {
		for (const root of [this.options.downloadDirectory, ...(this.options.extraRoots ?? [])]) {
			let path: string
			try {
				path = resolveWithin(root, destination)
			} catch (error) {
				if (error instanceof PathEscapeError) continue
				throw error
			}
			await rm(path, { force: true })
			return
		}
	}
}
