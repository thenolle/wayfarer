import { dirname } from 'node:path'
import { isLoopbackHost } from '../../config/config'
import { checksumStatus } from '../../downloads/domain/checksum'
import type { DownloadRecord, SegmentRecord } from '../../downloads/domain/records'
import { isFinalStatus } from '../../downloads/domain/status'
import type { DownloadStatus } from '../../downloads/domain/status'
import type { ApiRuntime } from '../../http/api/context'
import { progressOf } from '../../http/api/dto'
import { takeFlash } from '../../http/web/session'
import type { Session } from '../../http/web/session'
import { DEFAULT_SORT, filterOf, isFilterName, isRunning, isSortName, matchesFilter, MAX_QUERY_LENGTH } from '../view-model'
import type { DashboardData, DownloadView, FilterName, SortName, ViewState } from '../view-model'

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

const COMPARATORS: Readonly<Record<SortName, (a: DownloadRecord, b: DownloadRecord) => number>> = {
	status: (a, b) => {
		const byRank = RANK[a.status] - RANK[b.status]
		if (byRank !== 0) return byRank
		return a.status === 'completed' ? (b.completedAt ?? 0) - (a.completedAt ?? 0) : 0
	},
	newest: (a, b) => b.createdAt - a.createdAt,
	name: (a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base', numeric: true }),
	size: (a, b) => (b.totalBytes ?? -1) - (a.totalBytes ?? -1),
	progress: (a, b) => (progressOf(b) ?? -1) - (progressOf(a) ?? -1),
	priority: (a, b) => b.priority - a.priority
}

function toDownloadView(record: DownloadRecord, segments: readonly SegmentRecord[]): DownloadView {
	return {
		id: record.id,
		url: record.url,
		filename: record.filename,
		folder: dirname(record.destination),
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

function parseView(search: string): ViewState {
	const params = new URLSearchParams(search)
	const filter = params.get('filter') ?? ''
	const sort = params.get('sort') ?? ''
	return {
		filter: isFilterName(filter) ? filter : 'all',
		q: (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
		sort: isSortName(sort) ? sort : DEFAULT_SORT
	}
}

function matchesQuery(record: DownloadRecord, q: string): boolean {
	if (q === '') return true
	const needle = q.toLowerCase()
	return record.filename.toLowerCase().includes(needle) || record.url.toLowerCase().includes(needle)
}

/**
 * Collects what the dashboard page needs: the downloads of the selected tab,
 * counts for every tab, and the one-time message from the last action.
 * Active downloads come first, then queued, paused, failed, and finally
 * completed ones, newest first.
 */
export function buildDashboard(runtime: ApiRuntime, session: Session, search: string): DashboardData {
	const view = parseView(search)
	const records = runtime.downloads.list()
	const counts: Record<FilterName, number> = { all: records.length, active: 0, queued: 0, paused: 0, completed: 0, failed: 0 }
	let speed = 0
	let completedBytes = 0
	let activeDone = 0
	let activeTotal = 0
	for (const record of records) {
		counts[filterOf(record.status)] += 1
		if (isRunning(record.status)) {
			speed += record.speedBytesPerSecond
			if (record.totalBytes !== null) {
				activeDone += record.downloadedBytes
				activeTotal += record.totalBytes
			}
		}
		if (record.status === 'completed') completedBytes += record.downloadedBytes
	}
	const visible = records.filter((record) => matchesFilter(record.status, view.filter) && matchesQuery(record, view.q)).sort(COMPARATORS[view.sort])
	return {
		csrf: session.csrfToken,
		view,
		counts,
		stats: {
			speedBytesPerSecond: speed,
			active: counts.active,
			queued: counts.queued,
			completedBytes,
			activeProgress: activeTotal > 0 ? Math.min(1, activeDone / activeTotal) : null
		},
		downloads: visible.map((record) => toDownloadView(record, isFinalStatus(record.status) ? [] : runtime.segments.list(record.id))),
		flash: takeFlash(session),
		bandwidthBytesPerSecond: runtime.limiter.bytesPerSecond,
		locations: runtime.config.locations.map((location) => ({ id: location.id, label: location.label })),
		canReveal: isLoopbackHost(runtime.config.host),
	}
}
