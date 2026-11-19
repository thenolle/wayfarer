import { describe, expect, test } from 'bun:test'
import type { DownloadStatus } from '../../src/downloads/domain/status'
import { collectStats, renderMetrics } from '../../src/http/api/stats'

const list: { status: DownloadStatus; speedBytesPerSecond: number; downloadedBytes: number }[] = [
	{ status: 'downloading', speedBytesPerSecond: 100, downloadedBytes: 5 },
	{ status: 'paused', speedBytesPerSecond: 7, downloadedBytes: 1 },
	{ status: 'completed', speedBytesPerSecond: 0, downloadedBytes: 1000 },
	{ status: 'completed', speedBytesPerSecond: 0, downloadedBytes: 24 }
]

describe('collectStats', () => {
	test('counts statuses and adds up speed and completed bytes', () => {
		const stats = collectStats({ downloads: { list: () => list }, limiter: { bytesPerSecond: 2048 } }, 1_000, 61_500)
		expect(stats.total).toBe(4)
		expect(stats.counts.completed).toBe(2)
		expect(stats.counts.queued).toBe(0)
		expect(stats.speedBytesPerSecond).toBe(100)
		expect(stats.completedBytes).toBe(1024)
		expect(stats.bandwidthLimitBytesPerSecond).toBe(2048)
		expect(stats.uptimeSeconds).toBe(60)
	})

	test('handles an empty list and a clock that went backwards', () => {
		const stats = collectStats({ downloads: { list: () => [] }, limiter: { bytesPerSecond: 0 } }, 10_000, 5_000)
		expect(stats.total).toBe(0)
		expect(stats.speedBytesPerSecond).toBe(0)
		expect(stats.uptimeSeconds).toBe(0)
	})
})

describe('renderMetrics', () => {
	const text = renderMetrics(collectStats({ downloads: { list: () => list }, limiter: { bytesPerSecond: 0 } }, 0, 5_000))

	test('writes one line per status and the summary gauges', () => {
		expect(text).toContain('wayfarer_downloads{status="completed"} 2')
		expect(text).toContain('wayfarer_downloads{status="failed"} 0')
		expect(text).toContain('wayfarer_speed_bytes_per_second 100')
		expect(text).toContain('wayfarer_completed_bytes 1024')
		expect(text).toContain('wayfarer_bandwidth_limit_bytes_per_second 0')
		expect(text).toContain('wayfarer_uptime_seconds 5')
	})

	test('follows the exposition format', () => {
		expect(text.endsWith('\n')).toBe(true)
		expect((text.match(/# HELP /g) ?? []).length).toBe((text.match(/# TYPE /g) ?? []).length)
		for (const line of text.trim().split('\n')) expect(line).toMatch(/^(# (HELP|TYPE) \w+ .+|\w+(\{status="[a-z]+"\})? \d+)$/)
	})
})
