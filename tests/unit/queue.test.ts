import { describe, expect, test } from 'bun:test'
import type { DownloadStatus } from '../../src/downloads/domain/status'
import { describeQueueResult, runQueueOperation } from '../../src/downloads/queue'

const records: { id: string; status: DownloadStatus }[] = [
	{ id: 'q', status: 'queued' }, { id: 'd', status: 'downloading' }, { id: 'p', status: 'paused' },
	{ id: 'f', status: 'failed' }, { id: 'c', status: 'completed' }, { id: 'x', status: 'cancelled' }
]

function setup(failing: readonly string[] = []) {
	const calls: string[] = []
	const deps = {
		downloads: { listByStatuses: (statuses: readonly DownloadStatus[]) => records.filter((record) => statuses.includes(record.status)) },
		scheduler: {
			pause: async (id: string) => { calls.push(`pause:${id}`); if (failing.includes(id)) throw new Error('busy') },
			resume: (id: string) => { calls.push(`resume:${id}`) },
			remove: async (id: string) => { calls.push(`remove:${id}`); return !failing.includes(id) }
		}
	}
	return { calls, deps }
}

describe('runQueueOperation', () => {
	test('pause-all pauses queued and running downloads only', async () => {
		const { calls, deps } = setup()
		expect(await runQueueOperation(deps, 'pause-all')).toEqual({ operation: 'pause-all', matched: 2, done: 2 })
		expect([...calls].sort()).toEqual(['pause:d', 'pause:q'])
	})

	test('resume-all and retry-failed resume the right downloads', async () => {
		const resumed = setup()
		await runQueueOperation(resumed.deps, 'resume-all')
		expect(resumed.calls).toEqual(['resume:p'])
		const retried = setup()
		await runQueueOperation(retried.deps, 'retry-failed')
		expect(retried.calls).toEqual(['resume:f'])
	})

	test('clearing removes only the chosen statuses', async () => {
		const finished = setup()
		await runQueueOperation(finished.deps, 'clear-finished')
		expect([...finished.calls].sort()).toEqual(['remove:c', 'remove:x'])
		const failed = setup()
		await runQueueOperation(failed.deps, 'clear-failed')
		expect(failed.calls).toEqual(['remove:f'])
	})

	test('counts downloads that could not be changed', async () => {
		expect(await runQueueOperation(setup(['d']).deps, 'pause-all')).toEqual({ operation: 'pause-all', matched: 2, done: 1 })
		expect(await runQueueOperation(setup(['c']).deps, 'clear-finished')).toEqual({ operation: 'clear-finished', matched: 2, done: 1 })
	})
})

describe('describeQueueResult', () => {
	test('words each outcome', () => {
		expect(describeQueueResult({ operation: 'pause-all', matched: 0, done: 0 })).toBe('Nothing to do')
		expect(describeQueueResult({ operation: 'pause-all', matched: 1, done: 1 })).toBe('Paused 1 download')
		expect(describeQueueResult({ operation: 'pause-all', matched: 3, done: 2 })).toBe('Paused 2 downloads; 1 could not be changed')
		expect(describeQueueResult({ operation: 'retry-failed', matched: 1, done: 1 })).toBe('Queued 1 download for another try')
		expect(describeQueueResult({ operation: 'clear-finished', matched: 2, done: 2 })).toBe('Removed 2 downloads from the list (files were kept)')
	})
})
