import { checksumStatus } from '../../downloads/domain/checksum'
import type { DownloadRecord, SegmentRecord } from '../../downloads/domain/records'
import { isFinalStatus } from '../../downloads/domain/status'
import type { DownloadStatus } from '../../downloads/domain/status'
import type { ApiRuntime } from '../../http/api/context'
import { progressOf } from '../../http/api/dto'
import { takeFlash } from '../../http/web/session'
import type { Session } from '../../http/web/session'
import { filterOf, isFilterName, matchesFilter } from '../view-model'
import type { DashboardData, DownloadView, FilterName } from '../view-model'

const RANK: Readonly<Record<DownloadStatus, number>> = {
	probing: 0,
	downloading: 0,
	verifying: 0,
	queued: 1,
	paused: 2,
	failed: 3,
	cancelled: 3,
	completed: 4
}

function toDownloadView(record: DownloadRecord, segments: readonly SegmentRecord[]): DownloadView {
	return {
		id: record.id,
		url: record.url,
		filename: record.filename,
		status: record.status,
		priority: record.priority,
		totalBytes: record.totalBytes,
		downloadedBytes: record.downloadedBytes,
		progress: progressOf(record),
		speedBytesPerSecond: record.speedBytesPerSecond,
		etaSeconds: record.etaSeconds,
		retryCount: record.retryCount,
		checksum: checksumStatus(record),
		error: record.errorCode === null ? null : { code: record.errorCode, message: record.errorMessage ?? '' },
		segments: segments.map((segment) => ({
			index: segment.index,
			downloadedBytes: segment.durableOffset - segment.startOffset,
			totalBytes: segment.endOffset - segment.startOffset + 1,
			status: segment.status
		}))
	}
}

/**
 * Collects what the dashboard page needs: the downloads of the selected tab,
 * counts for every tab, and the one-time message from the last action.
 * Active downloads come first, then queued, paused, failed, and finally
 * completed ones, newest first.
 */
export function buildDashboard(runtime: ApiRuntime, session: Session, search: string): DashboardData {
	const requested = new URLSearchParams(search).get('filter')
	const filter: FilterName = requested !== null && isFilterName(requested) ? requested : 'all'
	const records = runtime.downloads.list()
	const counts: Record<FilterName, number> = { all: records.length, active: 0, queued: 0, paused: 0, completed: 0, failed: 0 }
	for (const record of records) counts[filterOf(record.status)] += 1
	const visible = records.filter((record) => matchesFilter(record.status, filter)).sort((a, b) => {
		const byRank = RANK[a.status] - RANK[b.status]
		if (byRank !== 0) return byRank
		return a.status === 'completed' ? (b.completedAt ?? 0) - (a.completedAt ?? 0) : 0
	})
	return {
		csrf: session.csrfToken,
		filter,
		counts,
		downloads: visible.map((record) => toDownloadView(record, isFinalStatus(record.status) ? [] : runtime.segments.list(record.id))),
		flash: takeFlash(session),
		bandwidthBytesPerSecond: runtime.limiter.bytesPerSecond
	}
}
