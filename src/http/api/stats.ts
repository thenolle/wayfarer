import { json } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { DOWNLOAD_STATUSES, isActiveStatus } from '../../downloads/domain/status'
import type { DownloadStatus } from '../../downloads/domain/status'
import type { ApiRuntime } from './context'

/**
 * What the statistics need from the runtime, so tests can use plain objects.
 */
export interface StatsSource {
	readonly downloads: { list(): readonly { readonly status: DownloadStatus; readonly speedBytesPerSecond: number; readonly downloadedBytes: number }[] }
	readonly limiter: { readonly bytesPerSecond: number }
}

export interface Stats {
	readonly counts: Record<DownloadStatus, number>
	readonly total: number
	readonly speedBytesPerSecond: number
	readonly completedBytes: number
	readonly bandwidthLimitBytesPerSecond: number
	readonly uptimeSeconds: number
}

export function collectStats(source: StatsSource, startedAt: number, now: number = Date.now()): Stats {
	const counts = Object.fromEntries(DOWNLOAD_STATUSES.map((status) => [status, 0])) as Record<DownloadStatus, number>
	let total = 0
	let speed = 0
	let completedBytes = 0
	for (const record of source.downloads.list()) {
		counts[record.status] += 1
		total += 1
		if (isActiveStatus(record.status)) speed += record.speedBytesPerSecond
		if (record.status === 'completed') completedBytes += record.downloadedBytes
	}
	return { counts, total, speedBytesPerSecond: speed, completedBytes, bandwidthLimitBytesPerSecond: source.limiter.bytesPerSecond, uptimeSeconds: Math.max(0, Math.floor((now - startedAt) / 1000)) }
}

/**
 * Prometheus text exposition format (version 0.0.4).
 */
export function renderMetrics(stats: Stats): string {
	const lines: string[] = ['# HELP wayfarer_downloads Downloads in the list, by status.', '# TYPE wayfarer_downloads gauge']
	for (const status of DOWNLOAD_STATUSES) lines.push(`wayfarer_downloads{status="${status}"} ${stats.counts[status]}`)
	const gauge = (name: string, help: string, value: number): void => {
		lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`)
	}
	gauge('wayfarer_speed_bytes_per_second', 'Combined speed of running downloads.', stats.speedBytesPerSecond)
	gauge('wayfarer_completed_bytes', 'Size of completed downloads that are still in the list.', stats.completedBytes)
	gauge('wayfarer_bandwidth_limit_bytes_per_second', 'Global speed limit; 0 means unlimited.', stats.bandwidthLimitBytesPerSecond)
	gauge('wayfarer_uptime_seconds', 'Seconds since the HTTP server started.', stats.uptimeSeconds)
	return `${lines.join('\n')}\n`
}

/**
 * Registers `GET /api/stats` (JSON, `{ "data": ... }`) and `GET /api/metrics`
 * (Prometheus text). Both sit behind the same bearer-token guard as the rest
 * of `/api`. Neither exposes links, file names or paths.
 */
export function registerStatsRoutes(app: App, runtime: ApiRuntime): void {
	const startedAt = Date.now()
	app.get('/api/stats', () => json({ data: collectStats(runtime, startedAt) }))
	app.get('/api/metrics', () => new Response(renderMetrics(collectStats(runtime, startedAt)), {
		headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' }
	}))
}
