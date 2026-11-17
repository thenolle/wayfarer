import { InvalidTransitionError } from './errors'

export const DOWNLOAD_STATUSES = ['queued', 'probing', 'downloading', 'verifying', 'paused', 'completed', 'failed', 'cancelled'] as const

export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number]

/**
 * Statuses in which a download owns network connections or file handles.
 * A process that stops while a download is in one of these statuses leaves
 * work for startup recovery.
 */
export const ACTIVE_STATUSES = ['probing', 'downloading', 'verifying'] as const satisfies readonly DownloadStatus[]

export type ActiveStatus = (typeof ACTIVE_STATUSES)[number]

const TRANSITIONS: Readonly<Record<DownloadStatus, readonly DownloadStatus[]>> = {
	queued: ['probing', 'paused', 'cancelled'],
	probing: ['downloading', 'queued', 'paused', 'failed', 'cancelled'],
	downloading: ['verifying', 'completed', 'queued', 'paused', 'failed', 'cancelled'],
	verifying: ['completed', 'queued', 'paused', 'failed', 'cancelled'],
	paused: ['queued', 'cancelled'],
	failed: ['queued', 'cancelled'],
	completed: [],
	cancelled: []
}

export function isDownloadStatus(value: string): value is DownloadStatus {
	return DOWNLOAD_STATUSES.some((status) => status === value)
}

export function isActiveStatus(status: DownloadStatus): status is ActiveStatus {
	return ACTIVE_STATUSES.some((active) => active === status)
}

export function isFinalStatus(status: DownloadStatus): boolean {
	return TRANSITIONS[status].length === 0
}

export function canTransition(from: DownloadStatus, to: DownloadStatus): boolean {
	return TRANSITIONS[from].includes(to)
}

/**
 * @throws {InvalidTransitionError} when the transition is not allowed.
 */
export function assertTransition(from: DownloadStatus, to: DownloadStatus): void {
	if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
}
