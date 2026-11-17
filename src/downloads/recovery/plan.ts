import type { DownloadRecord, SegmentRecord } from '../domain/records'
import { coversExactly, durableBytes, isSegmentComplete } from '../segments/plan'

export type RestartReason = 'unknown-size' | 'part-file-missing' | 'part-file-size-mismatch' | 'invalid-segment-layout'

/**
 * What to do with a download that was interrupted mid-transfer.
 *
 * - `resume`: continue from the recorded durable offsets.
 * - `verify`: every segment finished; only verification and finalisation remain.
 * - `restart`: the saved state cannot be trusted; discard it and start over.
 */
export type RecoveryPlan =
  | { readonly action: 'resume'; readonly downloadedBytes: number }
  | { readonly action: 'verify'; readonly downloadedBytes: number }
  | { readonly action: 'restart'; readonly reason: RestartReason }

export interface RecoveryInput {
  readonly download: DownloadRecord
  readonly segments: readonly SegmentRecord[]
  readonly partFileSize: number | null
}

/**
 * Decides how to recover an interrupted download by comparing the database
 * with the part file on disk. Pure and deterministic.
 *
 * Only durable offsets are trusted. Bytes beyond them may exist in the part
 * file, but they are simply written again, so resuming never depends on them.
 *
 * Remote validators (ETag, Last-Modified) are checked by the engine when the
 * resumed download makes its first request.
 */
export function planRecovery(input: RecoveryInput): RecoveryPlan {
  const { download, segments, partFileSize } = input
  const total = download.totalBytes
  if (total === null) return { action: 'restart', reason: 'unknown-size' }
  if (segments.length === 0) return { action: 'resume', downloadedBytes: 0 }
  if (!coversExactly(segments, total)) return { action: 'restart', reason: 'invalid-segment-layout' }
  const hasProgress = segments.some((segment) => durableBytes(segment) > 0)
  if (hasProgress) {
    if (partFileSize === null) return { action: 'restart', reason: 'part-file-missing' }
    if (partFileSize !== total) return { action: 'restart', reason: 'part-file-size-mismatch' }
  }
  const downloadedBytes = segments.reduce((sum, segment) => sum + durableBytes(segment), 0)
  if (segments.every(isSegmentComplete)) return { action: 'verify', downloadedBytes }
  return { action: 'resume', downloadedBytes }
}
