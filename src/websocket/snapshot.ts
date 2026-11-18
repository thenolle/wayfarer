import { isFinalStatus } from '../downloads/domain/status'
import type { ApiRuntime } from '../http/api/context'
import { progressOf } from '../http/api/dto'
import type { DownloadLive } from '../shared/live-protocol'

/**
 * Reads the live state of every download, including per-segment progress for
 * downloads that have not reached a final status.
 */
export function collectLiveSnapshot(runtime: Pick<ApiRuntime, 'downloads' | 'segments'>): DownloadLive[] {
	return runtime.downloads.list().map((record) => ({
		id: record.id,
		status: record.status,
		downloadedBytes: record.downloadedBytes,
		totalBytes: record.totalBytes,
		progress: progressOf(record),
		speedBytesPerSecond: record.speedBytesPerSecond,
		etaSeconds: record.etaSeconds,
		retryCount: record.retryCount,
		error: record.errorMessage,
		segments: isFinalStatus(record.status) ? [] : runtime.segments.list(record.id).map((segment) => ({
			index: segment.index,
			downloadedBytes: segment.durableOffset - segment.startOffset,
			totalBytes: segment.endOffset - segment.startOffset + 1,
			status: segment.status
		}))
	}))
}
