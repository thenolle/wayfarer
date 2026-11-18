export const LIVE_PROTOCOL_VERSION = 1

export type LiveSegment = {
	readonly index: number
	readonly downloadedBytes: number
	readonly totalBytes: number
	readonly status: string
}

export type DownloadLive = {
	readonly id: string
	readonly status: string
	readonly downloadedBytes: number
	readonly totalBytes: number | null
	readonly progress: number | null
	readonly speedBytesPerSecond: number
	readonly etaSeconds: number | null
	readonly retryCount: number
	readonly error: string | null
	readonly segments: readonly LiveSegment[]
}

/**
 * Messages sent from the server to the dashboard. `snapshot` carries every
 * download once, on connect. `update` carries only downloads that changed
 * since the previous update, plus the ids of downloads that were deleted.
 */
export type LiveMessage =
	| { readonly type: 'snapshot'; readonly version: 1; readonly downloads: readonly DownloadLive[] }
	| { readonly type: 'update', readonly version: 1, readonly downloads: readonly DownloadLive[], readonly removed: readonly string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

function isNumberOrNull(value: unknown): value is number | null {
	return value === null || isNumber(value)
}

function parseSegment(value: unknown): LiveSegment | null {
	if (!isRecord(value)) return null
	const index = value['index']
	const downloadedBytes = value['downloadedBytes']
	const totalBytes = value['totalBytes']
	const status = value['status']
	if (!isNumber(index) || !isNumber(downloadedBytes) || !isNumber(totalBytes) || typeof status !== 'string') return null
	return { index, downloadedBytes, totalBytes, status }
}

function parseDownload(value: unknown): DownloadLive | null {
	if (!isRecord(value)) return null
	const id = value['id']
	const status = value['status']
	const downloadedBytes = value['downloadedBytes']
	const totalBytes = value['totalBytes']
	const progress = value['progress']
	const speed = value['speedBytesPerSecond']
	const eta = value['etaSeconds']
	const retryCount = value['retryCount']
	const error = value['error']
	const rawSegments = value['segments']
	if (typeof id !== 'string' || typeof status !== 'string') return null
	if (!isNumber(downloadedBytes) || !isNumberOrNull(totalBytes) || !isNumberOrNull(progress)) return null
	if (!isNumber(speed) || !isNumberOrNull(eta) || !isNumber(retryCount)) return null
	if (error !== null && typeof error !== 'string') return null
	if (!Array.isArray(rawSegments)) return null
	const segments: LiveSegment[] = []
	for (const raw of rawSegments) {
		const segment = parseSegment(raw)
		if (segment === null) return null
		segments.push(segment)
	}
	return { id, status, downloadedBytes, totalBytes, progress, speedBytesPerSecond: speed, etaSeconds: eta, retryCount, error, segments }
}

function parseDownloads(value: unknown): DownloadLive[] | null {
	if (!Array.isArray(value)) return null
	const downloads: DownloadLive[] = []
	for (const raw of value) {
		const download = parseDownload(raw)
		if (download === null) return null
		downloads.push(download)
	}
	return downloads
}

/**
 * Validates a message received from the server. Returns null for anything that
 * is not a well-formed message of the supported version.
 */
export function parseLiveMessage(text: string): LiveMessage | null {
	let value: unknown
	try { value = JSON.parse(text) } catch { return null }
	if (!isRecord(value) || value['version'] !== LIVE_PROTOCOL_VERSION) return null
	const downloads = parseDownloads(value['downloads'])
	if (downloads === null) return null
	if (value['type'] === 'snapshot') return { type: 'snapshot', version: 1, downloads }
	const removed = value['removed']
	if (value['type'] === 'update' && Array.isArray(removed) && removed.every((id) => typeof id === 'string')) return { type: 'update', version: 1, downloads, removed }
	return null
}
