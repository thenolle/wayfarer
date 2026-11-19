import type { DownloadStatus } from './domain/status'

export const QUEUE_OPERATIONS = ['pause-all', 'resume-all', 'retry-failed', 'clear-finished', 'clear-failed'] as const
export type QueueOperation = (typeof QUEUE_OPERATIONS)[number]

export function isQueueOperation(value: string): value is QueueOperation {
	return QUEUE_OPERATIONS.some((operation) => operation === value)
}

const TARGETS: Readonly<Record<QueueOperation, readonly DownloadStatus[]>> = {
	'pause-all': ['queued', 'probing', 'downloading', 'verifying'],
	'resume-all': ['paused'],
	'retry-failed': ['failed'],
	'clear-finished': ['completed', 'cancelled'],
	'clear-failed': ['failed']
}

const VERBS: Readonly<Record<QueueOperation, string>> = {
	'pause-all': 'Paused',
	'resume-all': 'Resumed',
	'retry-failed': 'Queued',
	'clear-finished': 'Removed',
	'clear-failed': 'Removed'
}

/**
 * The parts of the repository and scheduler this module needs, so tests can
 * use plain fakes.
 */
export interface QueueDependencies {
	readonly downloads: { listByStatuses(statuses: readonly DownloadStatus[]): readonly { readonly id: string }[] }
	readonly scheduler: {
		pause(id: string): Promise<unknown>
		resume(id: string): unknown
		remove(id: string): Promise<boolean>
	}
}

export interface QueueResult {
	readonly operation: QueueOperation
	readonly matched: number
	readonly done: number
}

/**
 * Applies one operation to every download it concerns. Clearing only removes
 * list entries; files on disk are never deleted. A download that changes state
 * while the operation runs counts as matched but not done.
 */
export async function runQueueOperation(deps: QueueDependencies, operation: QueueOperation): Promise<QueueResult> {
	const records = deps.downloads.listByStatuses(TARGETS[operation])
	const outcomes = await Promise.allSettled(records.map(async (record): Promise<boolean> => {
		switch (operation) {
			case 'pause-all':
				await deps.scheduler.pause(record.id)
				return true
			case 'resume-all':
			case 'retry-failed':
				await deps.scheduler.resume(record.id)
				return true
			case 'clear-finished':
			case 'clear-failed':
				return deps.scheduler.remove(record.id)
		}
	}))
	return { operation, matched: records.length, done: outcomes.filter((outcome) => outcome.status === 'fulfilled' && outcome.value).length }
}

export function describeQueueResult(result: QueueResult): string {
	if (result.matched === 0) return 'Nothing to do'
	const count = `${result.done} ${result.done === 1 ? 'download' : 'downloads'}`
	const tail = result.operation === 'retry-failed' ? ' for another try' : result.operation.startsWith('clear') ? ' from the list (files were kept)' : ''
	const skipped = result.matched - result.done
	return `${VERBS[result.operation]} ${count}${tail}${skipped > 0 ? `; ${skipped} could not be changed` : ''}`
}
