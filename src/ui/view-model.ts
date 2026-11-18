import type { SegmentStatus } from '../downloads/domain/records'
import type { DownloadStatus } from '../downloads/domain/status'

export const FILTERS = ['all', 'active', 'queued', 'paused', 'completed', 'failed'] as const
export type FilterName = (typeof FILTERS)[number]

export const FILTER_LABELS: Readonly<Record<FilterName, string>> = {
	all: 'All downloads',
	active: 'Active',
	queued: 'Queued',
	paused: 'Paused',
	completed: 'Completed',
	failed: 'Failed'
}

export const SORTS = ['status', 'newest', 'name', 'size', 'progress', 'priority'] as const
export type SortName = (typeof SORTS)[number]

export const DEFAULT_SORT: SortName = 'status'
export const SORT_LABELS: Readonly<Record<SortName, string>> = {
	status: 'Status',
	newest: 'Newest first',
	name: 'Name',
	size: 'Size',
	progress: 'Progress',
	priority: 'Priority'
}

export const MAX_QUERY_LENGTH = 200

export function isFilterName(value: string): value is FilterName {
	return FILTERS.some((name) => name === value)
}

export function isSortName(value: string): value is SortName {
	return SORTS.some((name) => name === value)
}

export function isRunning(status: DownloadStatus): boolean {
	return status === 'probing' || status === 'downloading' || status === 'verifying'
}

/**
 * The tab a status belongs to. Cancelled downloads are listed with failed ones.
 */
export function filterOf(status: DownloadStatus): Exclude<FilterName, 'all'> {
	switch (status) {
		case 'probing':
		case 'downloading':
		case 'verifying': return 'active'
		case 'queued': return 'queued'
		case 'paused': return 'paused'
		case 'completed': return 'completed'
		case 'failed':
		case 'cancelled': return 'failed'
	}
}

export function matchesFilter(status: DownloadStatus, filter: FilterName): boolean {
	return filter === 'all' || filterOf(status) === filter
}

export type ViewState = { readonly filter: FilterName; readonly q: string; readonly sort: SortName }

export function viewHref(view: ViewState, overrides: Partial<ViewState> = {}): string {
	const next = { ...view, ...overrides }
	const params = new URLSearchParams()
	if (next.filter !== 'all') params.set('filter', next.filter)
	if (next.q !== '') params.set('q', next.q)
	if (next.sort !== DEFAULT_SORT) params.set('sort', next.sort)
	const text = params.toString()
	return text === '' ? '/' : `/?${text}`
}

export type ChecksumView =
	| { readonly state: 'not-requested' }
	| { readonly state: 'pending'; readonly expected: string }
	| { readonly state: 'verified'; readonly sha256: string }
	| { readonly state: 'mismatch'; readonly expected: string; readonly actual: string }

export type SegmentView = {
	readonly index: number
	readonly downloadedBytes: number
	readonly totalBytes: number
	readonly status: SegmentStatus
}

/**
 * A download as the dashboard sees it. It contains only what the page shows;
 * no file paths, resolved URLs or other server details.
 */
export type DownloadView = {
	readonly id: string
	readonly url: string
	readonly filename: string
	readonly status: DownloadStatus
	readonly priority: number
	readonly totalBytes: number | null
	readonly downloadedBytes: number
	readonly progress: number | null
	readonly speedBytesPerSecond: number
	readonly etaSeconds: number | null
	readonly retryCount: number
	readonly checksum: ChecksumView
	readonly error: { readonly code: string; readonly message: string } | null
	readonly segments: SegmentView[]
	readonly folder: string
}

export type FlashView = { readonly kind: 'success' | 'error'; readonly message: string }
export type ShellData = { readonly csrf: string; readonly authRequired: boolean }
export type LoginData = { readonly csrf: string; readonly flash: FlashView | null }

export type StatsView = {
	readonly speedBytesPerSecond: number
	readonly active: number
	readonly queued: number
	readonly completedBytes: number
	readonly activeProgress: number | null
}

export type DashboardData = {
	readonly csrf: string
	readonly view: ViewState
	readonly counts: Record<FilterName, number>
	readonly stats: StatsView
	readonly downloads: DownloadView[]
	readonly flash: FlashView | null
	readonly bandwidthBytesPerSecond: number
	readonly locations: { readonly id: string; readonly label: string }[]
	readonly canReveal: boolean
}
