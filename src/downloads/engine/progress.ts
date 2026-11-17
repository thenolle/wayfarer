import type { DownloadsRepository } from '../../database/downloads-repository'
import type { SegmentProgress, SegmentsRepository } from '../../database/segments-repository'
import type { SegmentRecord, SegmentStatus } from '../domain/records'

const SPEED_SMOOTHING = 0.3

interface SegmentState {
	next: number
	status: SegmentStatus
	persistedNext: number
	persistedStatus: SegmentStatus
}

export interface TrackerOptions {
	readonly downloadId: string
	readonly totalBytes: number | null
	readonly intervalMs: number
	/** When false, only download-level progress is stored, not segment offsets. */
	readonly trackSegments: boolean
	readonly downloads: DownloadsRepository
	readonly segments: SegmentsRepository
	readonly syncFile: () => Promise<void>
	readonly onFailure: (error: unknown) => void
	readonly clock?: () => number
}

/**
 * Keeps in-memory progress and writes it to SQLite on a timer.
 *
 * Each flush follows one rule: it captures offsets first, forces the part
 * file to disk, and only then stores the captured offsets. A stored offset
 * therefore never points past data that is not durably on disk, even if the
 * process dies mid-flush. Offsets are batched (default every 250 ms) rather
 * than written per network chunk.
 *
 * Speed is an exponential moving average over flush intervals.
 */
export class ProgressTracker {
	private readonly states = new Map<number, SegmentState>()
	private readonly clock: () => number
	private bytes: number
	private lastBytes: number
	private lastTime: number
	private speed = 0
	private timer: ReturnType<typeof setInterval> | undefined
	private queue: Promise<void> = Promise.resolve()

	constructor(private readonly options: TrackerOptions, segments: readonly SegmentRecord[], initialBytes: number) {
		this.clock = options.clock ?? Date.now
		this.bytes = initialBytes
		this.lastBytes = initialBytes
		this.lastTime = this.clock()
		for (const segment of segments) this.states.set(segment.id, { next: segment.durableOffset, status: segment.status === 'completed' ? 'completed' : 'pending', persistedNext: segment.durableOffset, persistedStatus: segment.status })
	}

	get bytesWritten(): number {
		return this.bytes
	}

	/**
	 * The next absolute offset this segment still has to fetch.
	 */
	nextOffset(segmentId: number): number {
		return this.state(segmentId).next
	}

	/**
	 * Records that `bytes` more bytes of a segment were written, ending just
	 * before `nextOffset`.
	 */
	advance(segmentId: number, nextOffset: number, bytes: number): void {
		this.state(segmentId).next = nextOffset
		this.bytes += bytes
	}

	addBytes(bytes: number): void {
		this.bytes += bytes
	}

	markStatus(segmentId: number, status: SegmentStatus): void {
		this.state(segmentId).status = status
	}

	/**
	 * Forgets bytes counted so far, for a transfer that restarts from zero.
	 */
	reset(): void {
		this.bytes = 0
		this.lastBytes = 0
		this.speed = 0
	}

	start(): void {
		this.timer = setInterval(() => {
			this.flush().catch(this.options.onFailure)
		}, this.options.intervalMs)
	}

	/**
	 * Stops the timer and performs a final flush. Failures are reported through
	 * `onFailure` instead of being thrown, so cleanup can always continue.
	 */
	async stop(): Promise<void> {
		if (this.timer !== undefined) clearInterval(this.timer)
		this.timer = undefined
		await this.flush().catch(this.options.onFailure)
	}

	flush(): Promise<void> {
		this.queue = this.queue.catch(() => undefined).then(() => this.flushNow())
		return this.queue
	}

	private async flushNow(): Promise<void> {
		const now = this.clock()
		const bytes = this.bytes
		const updates: SegmentProgress[] = []
		if (this.options.trackSegments) for (const [id, state] of this.states) { if (state.next !== state.persistedNext || state.status !== state.persistedStatus) updates.push({ id, durableOffset: state.next, status: state.status }) }
		await this.options.syncFile()
		this.options.segments.saveDurable(updates)
		for (const update of updates) {
			const state = this.state(update.id)
			state.persistedNext = update.durableOffset
			state.persistedStatus = update.status
		}
		const elapsed = now - this.lastTime
		if (elapsed > 0) {
			const instant = ((bytes - this.lastBytes) * 1000) / elapsed
			this.speed = this.speed === 0 ? instant : SPEED_SMOOTHING * instant + (1 - SPEED_SMOOTHING) * this.speed
			this.lastBytes = bytes
			this.lastTime = now
		}
		const total = this.options.totalBytes
		const eta = total !== null && this.speed > 0 ? Math.ceil(Math.max(0, total - bytes) / this.speed) : null
		this.options.downloads.saveProgress([{ id: this.options.downloadId, downloadedBytes: bytes, speedBytesPerSecond: this.speed, etaSeconds: eta }])
	}

	private state(segmentId: number): SegmentState {
		const state = this.states.get(segmentId)
		if (state === undefined) throw new Error(`Unknown segment ${segmentId}`)
		return state
	}
}
