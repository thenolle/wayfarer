import type { ChecksumView } from './view-model'

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

export const PROGRESS_SCALE = 1000

const STATUS_LABELS: Readonly<Record<string, string>> = {
	queued: 'Queued',
	probing: 'Checking',
	downloading: 'Downloading',
	verifying: 'Verifying',
	paused: 'Paused',
	completed: 'Completed',
	failed: 'Failed',
	cancelled: 'Cancelled'
}

export function statusLabel(status: string): string {
	return STATUS_LABELS[status] ?? status
}

/**
 * Formats a byte count with binary units, for example `1.50 MiB`.
 */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '—'
	let value = bytes
	let unit = 0
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024
		unit += 1
	}
	const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2
	return `${value.toFixed(digits)} ${UNITS[unit] ?? 'B'}`
}

export function formatSpeed(bytesPerSecond: number): string {
	return bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : '—'
}

export function formatEta(seconds: number | null): string {
	if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
	if (seconds < 60) return `${Math.round(seconds)}s`
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
	const hours = Math.floor(seconds / 3600)
	if (hours > 99) return 'over 99h'
	return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function formatPercent(progress: number | null): string {
	return progress === null ? '—' : `${Math.floor(progress * 100)}%`
}

export function retryLabel(count: number): string {
	return `Retried ${count} ${count === 1 ? 'time' : 'times'}`
}

export function checksumLabel(checksum: ChecksumView): string | null {
	switch (checksum.state) {
		case 'not-requested': return null
		case 'pending': return 'SHA-256 will be checked after download'
		case 'verified': return 'SHA-256 verified'
		case 'mismatch': return 'SHA-256 did not match'
	}
}
