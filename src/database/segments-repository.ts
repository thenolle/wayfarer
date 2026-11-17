import type { Database } from 'bun:sqlite'
import { isSegmentStatus } from '../downloads/domain/records'
import type { SegmentRange, SegmentRecord, SegmentStatus } from '../downloads/domain/records'
import { inTransaction } from './sql'

interface SegmentRow {
	id: number
	download_id: string
	segment_index: number
	start_offset: number
	end_offset: number
	durable_offset: number
	status: string
	retry_count: number
	error_message: string | null
}

export interface SegmentProgress {
	readonly id: number
	readonly durableOffset: number
	readonly status: SegmentStatus
}

function toRecord(row: SegmentRow): SegmentRecord {
	if (!isSegmentStatus(row.status)) throw new Error(`Segment ${row.id} has unknown status "${row.status}"`)
	return {
		id: row.id,
		downloadId: row.download_id,
		index: row.segment_index,
		startOffset: row.start_offset,
		endOffset: row.end_offset,
		durableOffset: row.durable_offset,
		status: row.status,
		retryCount: row.retry_count,
		errorMessage: row.error_message
	}
}

/**
 * Persistence for the `segments` table.
 */
export class SegmentsRepository {
	constructor(private readonly database: Database) { }

	/**
	 * Replaces all segments of a download with fresh, pending ones.
	 */
	replace(downloadId: string, ranges: readonly SegmentRange[]): SegmentRecord[] {
		const insert = this.database.query<unknown, [string, number, number, number, number]>(`INSERT INTO segments (download_id, segment_index, start_offset, end_offset, durable_offset, status) VALUES (?, ?, ?, ?, ?, 'pending')`)
		return inTransaction(this.database, () => {
			this.deleteFor(downloadId)
			for (const range of ranges) insert.run(downloadId, range.index, range.startOffset, range.endOffset, range.startOffset)
			return this.list(downloadId)
		})
	}

	list(downloadId: string): SegmentRecord[] {
		return this.database.query<SegmentRow, [string]>('SELECT * FROM segments WHERE download_id = ? ORDER BY segment_index ASC').all(downloadId).map(toRecord)
	}

	/**
	 * Stores durable offsets for a batch of segments in one transaction. An
	 * offset never moves backwards: a stale update cannot undo progress that
	 * was already recorded.
	 */
	saveDurable(updates: readonly SegmentProgress[]): void {
		if (updates.length === 0) return
		const statement = this.database.query<unknown, [number, string, number]>(`UPDATE segments SET durable_offset = MAX(durable_offset, ?), status = ? WHERE id = ?`)
		inTransaction(this.database, () => {
			for (const update of updates) statement.run(update.durableOffset, update.status, update.id)
		})
	}

	setStatus(id: number, status: SegmentStatus, errorMessage: string | null = null): void {
		this.database.run('UPDATE segments SET status = ?, error_message = ? WHERE id = ?', [status, errorMessage, id])
	}

	/**
	 * Increments a segment's retry counter and stores the last error.
	 */
	recordRetry(id: number, errorMessage: string): void {
		this.database.run('UPDATE segments SET retry_count = retry_count + 1, error_message = ? WHERE id = ?', [errorMessage, id])
	}

	deleteFor(downloadId: string): void {
		this.database.run('DELETE FROM segments WHERE download_id = ?', [downloadId])
	}
}
