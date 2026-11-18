import { checksumStatus } from '../../downloads/domain/checksum'
import type { ChecksumStatus } from '../../downloads/domain/checksum'
import type { DownloadRecord, SegmentRecord, SegmentStatus } from '../../downloads/domain/records'
import type { DownloadStatus } from '../../downloads/domain/status'

export interface PublicSegment {
  readonly index: number
  readonly startOffset: number
  readonly endOffset: number
  readonly downloadedBytes: number
  readonly status: SegmentStatus
  readonly retryCount: number
  readonly error: string | null
}

/**
 * The only shape in which a download leaves the server, over the API and in
 * rendered pages. It deliberately omits the destination path, resolved URLs
 * and resolver metadata, which may contain filesystem details or tokens.
 */
export interface PublicDownload {
  readonly id: string
  readonly url: string
  readonly filename: string
  readonly status: DownloadStatus
  readonly priority: number
  readonly resolver: string | null
  readonly totalBytes: number | null
  readonly downloadedBytes: number
  readonly progress: number | null
  readonly speedBytesPerSecond: number
  readonly etaSeconds: number | null
  readonly checksum: ChecksumStatus
  readonly retryCount: number
  readonly error: { readonly code: string; readonly message: string } | null
  readonly createdAt: number
  readonly updatedAt: number
  readonly completedAt: number | null
  readonly segments?: readonly PublicSegment[]
}

function toPublicSegment(segment: SegmentRecord): PublicSegment {
  return {
    index: segment.index,
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
    downloadedBytes: segment.durableOffset - segment.startOffset,
    status: segment.status,
    retryCount: segment.retryCount,
    error: segment.errorMessage
  }
}

export function progressOf(record: DownloadRecord): number | null {
  if (record.status === 'completed') return 1
  if (record.totalBytes === null || record.totalBytes === 0) return null
  return Math.min(1, record.downloadedBytes / record.totalBytes)
}

export function toPublicDownload(record: DownloadRecord, segments?: readonly SegmentRecord[]): PublicDownload {
  return {
    id: record.id,
    url: record.url,
    filename: record.filename,
    status: record.status,
    priority: record.priority,
    resolver: record.resolver,
    totalBytes: record.totalBytes,
    downloadedBytes: record.downloadedBytes,
    progress: progressOf(record),
    speedBytesPerSecond: record.speedBytesPerSecond,
    etaSeconds: record.etaSeconds,
    checksum: checksumStatus(record),
    retryCount: record.retryCount,
    error: record.errorCode === null ? null : { code: record.errorCode, message: record.errorMessage ?? '' },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    ...(segments === undefined ? {} : { segments: segments.map(toPublicSegment) })
  }
}
