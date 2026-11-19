import type { DownloadStatus } from './domain/status'

export const DAY_MS = 86_400_000
const DEFAULT_INTERVAL_MS = 3_600_000

export interface RetentionEntry {
	readonly id: string
	readonly status: DownloadStatus
	readonly completedAt: number | null
	readonly updatedAt: number
}

export interface RetentionDependencies {
	readonly downloads: { list(): readonly RetentionEntry[] }
	readonly scheduler: { remove(id: string): Promise<boolean> }
}

export interface RetentionOptions {
	readonly days: number
	readonly intervalMs?: number
	readonly now?: () => number
	readonly log?: (message: string) => void
}

/**
 * Ids of completed or cancelled downloads that finished more than `days` days
 * ago. Failed, paused, queued and running downloads never expire. A period of
 * zero (or less) disables expiry.
 */
export function expiredIds(entries: readonly RetentionEntry[], days: number, now: number): string[] {
	if (days <= 0) return []
	const cutoff = now - days * DAY_MS
	return entries
		.filter((entry) => {
			if (entry.status === 'completed') return (entry.completedAt ?? entry.updatedAt) < cutoff
			if (entry.status === 'cancelled') return entry.updatedAt < cutoff
			return false
		})
		.map((entry) => entry.id)
}

/**
 * Removes expired entries from the downloads list, at startup and then on a
 * timer. Files on disk are never deleted. `sweep` never rejects, and
 * overlapping calls share one run.
 */
export class RetentionSweeper {
	private timer: ReturnType<typeof setInterval> | null = null
	private running: Promise<number> | null = null

	constructor(private readonly deps: RetentionDependencies, private readonly options: RetentionOptions) { }

	start(): void {
		if (this.options.days <= 0 || this.timer !== null) return
		void this.sweep()
		this.timer = setInterval(() => void this.sweep(), this.options.intervalMs ?? DEFAULT_INTERVAL_MS)
		this.timer.unref?.()
	}

	/**
	 * Stops the timer and waits for a sweep in progress.
	 */
	async stop(): Promise<void> {
		if (this.timer !== null) clearInterval(this.timer)
		this.timer = null
		await this.running
	}

	/**
	 * Resolves with the number of entries removed.
	 */
	sweep(): Promise<number> {
		this.running ??= this.run().finally(() => {
			this.running = null
		})
		return this.running
	}

	private async run(): Promise<number> {
		const log = this.options.log ?? ((message: string) => console.log(`[wayfarer] ${message}`))
		let ids: string[]
		try {
			ids = expiredIds(this.deps.downloads.list(), this.options.days, (this.options.now ?? Date.now)())
		} catch {
			log('retention sweep skipped: the downloads could not be read')
			return 0
		}
		let removed = 0
		for (const id of ids) {
			try {
				if (await this.deps.scheduler.remove(id)) removed += 1
			} catch {
				log(`retention could not remove download ${id}`)
			}
		}
		if (removed > 0) log(`removed ${removed} finished ${removed === 1 ? 'download' : 'downloads'} older than ${this.options.days} ${this.options.days === 1 ? 'day' : 'days'} from the list; files were kept`)
		return removed
	}
}
