import type { Database } from 'bun:sqlite'
import { DownloadNotFoundError } from '../downloads/domain/errors'
import type { DownloadRecord } from '../downloads/domain/records'
import { assertTransition, isDownloadStatus } from '../downloads/domain/status'
import type { DownloadStatus } from '../downloads/domain/status'
import { inTransaction } from './sql'
import type { Binding } from './sql'

interface DownloadRow {
	id: string
	url: string
	resolver: string | null
	resolved_url: string | null
	resolved_metadata: string | null
	filename: string
	destination: string
	status: string
	priority: number
	total_bytes: number | null
	downloaded_bytes: number
	speed_bps: number
	eta_seconds: number | null
	etag: string | null
	last_modified: string | null
	expected_sha256: string | null
	actual_sha256: string | null
	error_code: string | null
	error_message: string | null
	retry_count: number
	created_at: number
	updated_at: number
	completed_at: number | null
}

export interface NewDownload {
	readonly url: string
	readonly filename: string
	readonly destination: string
	readonly priority?: number
	readonly expectedSha256?: string | null
}

/**
 * Fields that can be changed after creation. Omitted fields are left as they
 * are; `null` clears nullable fields.
 */
export interface DownloadPatch {
	readonly resolver?: string | null
	readonly resolvedUrl?: string | null
	readonly resolvedMetadata?: string | null
	readonly filename?: string
	readonly destination?: string
	readonly priority?: number
	readonly totalBytes?: number | null
	readonly downloadedBytes?: number
	readonly speedBytesPerSecond?: number
	readonly etaSeconds?: number | null
	readonly etag?: string | null
	readonly lastModified?: string | null
	readonly expectedSha256?: string | null
	readonly actualSha256?: string | null
	readonly errorCode?: string | null
	readonly errorMessage?: string | null
	readonly retryCount?: number
}

export interface ProgressUpdate {
	readonly id: string
	readonly downloadedBytes: number
	readonly speedBytesPerSecond: number
	readonly etaSeconds: number | null
}

const PATCH_COLUMNS: readonly (readonly [keyof DownloadPatch, string])[] = [
	['resolver', 'resolver'],
	['resolvedUrl', 'resolved_url'],
	['resolvedMetadata', 'resolved_metadata'],
	['filename', 'filename'],
	['destination', 'destination'],
	['priority', 'priority'],
	['totalBytes', 'total_bytes'],
	['downloadedBytes', 'downloaded_bytes'],
	['speedBytesPerSecond', 'speed_bps'],
	['etaSeconds', 'eta_seconds'],
	['etag', 'etag'],
	['lastModified', 'last_modified'],
	['expectedSha256', 'expected_sha256'],
	['actualSha256', 'actual_sha256'],
	['errorCode', 'error_code'],
	['errorMessage', 'error_message'],
	['retryCount', 'retry_count']
]

function toRecord(row: DownloadRow): DownloadRecord {
	if (!isDownloadStatus(row.status)) throw new Error(`Download "${row.id}" has unknown status "${row.status}"`)
	return {
		id: row.id,
		url: row.url,
		resolver: row.resolver,
		resolvedUrl: row.resolved_url,
		resolvedMetadata: row.resolved_metadata,
		filename: row.filename,
		destination: row.destination,
		status: row.status,
		priority: row.priority,
		totalBytes: row.total_bytes,
		downloadedBytes: row.downloaded_bytes,
		speedBytesPerSecond: row.speed_bps,
		etaSeconds: row.eta_seconds,
		etag: row.etag,
		lastModified: row.last_modified,
		expectedSha256: row.expected_sha256,
		actualSha256: row.actual_sha256,
		errorCode: row.error_code,
		errorMessage: row.error_message,
		retryCount: row.retry_count,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at
	}
}

/**
 * Persistence for the `downloads` table. Status changes are validated by the
 * download state machine.
 */
export class DownloadsRepository {
	constructor(private readonly database: Database, private readonly clock: () => number = Date.now) { }

	/**
	 * Inserts a queued download.
	 *
	 * @throws {Error} when the destination is already used (case-insensitive).
	 */
	create(input: NewDownload): DownloadRecord {
		const now = this.clock()
		const id = crypto.randomUUID()
		this.database.run(
			`INSERT INTO downloads (id, url, filename, destination, status, priority, expected_sha256, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
			[id, input.url, input.filename, input.destination, input.priority ?? 0, input.expectedSha256 ?? null, now, now]
		)
		return this.require(id)
	}

	get(id: string): DownloadRecord | null {
		const row = this.database.query<DownloadRow, [string]>('SELECT * FROM downloads WHERE id = ?').get(id)
		return row === null ? null : toRecord(row)
	}

	/**
	 * @throws {DownloadNotFoundError} when no download has this id.
	 */
	require(id: string): DownloadRecord {
		const record = this.get(id)
		if (record === null) throw new DownloadNotFoundError(id)
		return record
	}

	/**
	 * Lists downloads by priority (highest first), then age.
	 */
	list(): DownloadRecord[] {
		return this.database.query<DownloadRow, []>('SELECT * FROM downloads ORDER BY priority DESC, created_at ASC, id ASC').all().map(toRecord)
	}

	listByStatuses(statuses: readonly DownloadStatus[]): DownloadRecord[] {
		if (statuses.length === 0) return []
		const placeholders = statuses.map(() => '?').join(', ')
		return this.database.query<DownloadRow, Binding[]>(`SELECT * FROM downloads WHERE status IN (${placeholders}) ORDER BY priority DESC, created_at ASC, id ASC`).all(...statuses).map(toRecord)
	}

	/**
	 * Applies a patch without changing the status.
	 *
	 * @throws {DownloadNotFoundError} when no download has this id.
	 */
	update(id: string, patch: DownloadPatch): DownloadRecord {
		return inTransaction(this.database, () => {
			this.require(id)
			this.write(id, patch, undefined)
			return this.require(id)
		})
	}

	/**
	 * Moves a download to `to` after validating the transition, optionally
	 * applying a patch in the same transaction. Entering `completed` records
	 * the completion time.
	 *
	 * @throws {InvalidTransitionError} when the state machine forbids the move.
	 * @throws {DownloadNotFoundError} when no download has this id.
	 */
	setStatus(id: string, to: DownloadStatus, patch: DownloadPatch = {}): DownloadRecord {
		return inTransaction(this.database, () => {
			const current = this.require(id)
			assertTransition(current.status, to)
			this.write(id, patch, to)
			return this.require(id)
		})
	}

	/**
	 * Stores a batch of progress samples in one transaction. Only downloads
	 * that are still `downloading` are updated, so a late batch cannot
	 * overwrite the state of a download that was paused or cancelled.
	 */
	saveProgress(updates: readonly ProgressUpdate[]): void {
		if (updates.length === 0) return
		const statement = this.database.query<unknown, [number, number, number | null, number, string]>(`UPDATE downloads SET downloaded_bytes = ?, speed_bps = ?, eta_seconds = ?, updated_at = ? WHERE id = ? AND status = 'downloading'`)
		const now = this.clock()
		inTransaction(this.database, () => {
			for (const update of updates) statement.run(update.downloadedBytes, update.speedBytesPerSecond, update.etaSeconds, now, update.id)
		})
	}

	/**
	 * Deletes a download and, through the foreign key, its segments.
	 * Returns false when no download had this id.
	 */
	delete(id: string): boolean {
		return this.database.run('DELETE FROM downloads WHERE id = ?', [id]).changes > 0
	}

	private write(id: string, patch: DownloadPatch, status: DownloadStatus | undefined): void {
		const now = this.clock()
		const assignments: string[] = ['updated_at = ?']
		const values: Binding[] = [now]
		if (status !== undefined) {
			assignments.push('status = ?')
			values.push(status)
			if (status === 'completed') {
				assignments.push('completed_at = ?')
				values.push(now)
			}
		}
		for (const [key, column] of PATCH_COLUMNS) {
			const value = patch[key]
			if (value === undefined) continue
			assignments.push(`${column} = ?`)
			values.push(value)
		}
		values.push(id)
		this.database.run(`UPDATE downloads SET ${assignments.join(', ')} WHERE id = ?`, values)
	}
}
