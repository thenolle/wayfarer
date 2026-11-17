import type { DownloadStatus } from './status'

/**
 * A persisted download. Timestamps are milliseconds since the Unix epoch.
 * `destination` and `resolvedMetadata` are server-side values and must never
 * be sent to browsers or API clients unfiltered.
 */
export interface DownloadRecord {
	readonly id: string
	readonly url: string
	readonly resolver: string | null
	readonly resolvedUrl: string | null
	readonly resolvedMetadata: string | null
	readonly filename: string
	readonly destination: string
	readonly status: DownloadStatus
	readonly priority: number
	readonly totalBytes: number | null
	readonly downloadedBytes: number
	readonly speedBytesPerSecond: number
	readonly etaSeconds: number | null
	readonly etag: string | null
	readonly lastModified: string | null
	readonly expectedSha256: string | null
	readonly actualSha256: string | null
	readonly errorCode: string | null
	readonly errorMessage: string | null
	readonly retryCount: number
	readonly createdAt: number
	readonly updatedAt: number
	readonly completedAt: number | null
}

export const SEGMENT_STATUSES = ['pending', 'active', 'completed', 'failed'] as const

export type SegmentStatus = (typeof SEGMENT_STATUSES)[number]

export function isSegmentStatus(value: string): value is SegmentStatus {
	return SEGMENT_STATUSES.some((status) => status === value)
}

/**
 * A byte range of the remote file. Both offsets are inclusive.
 */
export interface SegmentRange {
	readonly index: number
	readonly startOffset: number
	readonly endOffset: number
}

/**
 * A persisted segment. `durableOffset` is the absolute position of the next
 * byte that has not yet been confirmed on disk. It starts at `startOffset`
 * and equals `endOffset + 1` when the segment is complete.
 */
export interface SegmentRecord extends SegmentRange {
	readonly id: number
	readonly downloadId: string
	readonly durableOffset: number
	readonly status: SegmentStatus
	readonly retryCount: number
	readonly errorMessage: string | null
}
