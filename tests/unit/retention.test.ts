import { describe, expect, test } from 'bun:test'
import type { DownloadStatus } from '../../src/downloads/domain/status'
import { DAY_MS, expiredIds, RetentionSweeper } from '../../src/downloads/retention'
import type { RetentionEntry } from '../../src/downloads/retention'
import { waitFor } from '../helpers/wait'

const NOW = 100 * DAY_MS

function entry(id: string, status: DownloadStatus, daysAgo: number, stamped = true): RetentionEntry {
	const when = NOW - daysAgo * DAY_MS
	return { id, status, completedAt: status === 'completed' && stamped ? when : null, updatedAt: when }
}

const entries: RetentionEntry[] = [
	entry('old-done', 'completed', 31),
	entry('new-done', 'completed', 29),
	entry('edge', 'completed', 30),
	entry('old-cancelled', 'cancelled', 40),
	entry('old-failed', 'failed', 90),
	entry('old-paused', 'paused', 90),
	entry('old-running', 'downloading', 90),
	entry('old-queued', 'queued', 90)
]

function setup(options: { days?: number; failing?: readonly string[]; list?: () => readonly RetentionEntry[] } = {}) {
	const removed: string[] = []
	const logs: string[] = []
	const lists = { count: 0 }
	const sweeper = new RetentionSweeper(
		{
			downloads: { list: () => { lists.count += 1; return (options.list ?? (() => entries))() } },
			scheduler: {
				remove: async (id) => {
					if (options.failing?.includes(id)) throw new Error('locked')
					removed.push(id)
					return true
				}
			}
		},
		{ days: options.days ?? 30, intervalMs: 10, now: () => NOW, log: (message) => { logs.push(message) } }
	)
	return { sweeper, removed, logs, lists }
}

describe('expiredIds', () => {
	test('expires only old completed and cancelled downloads', () => {
		expect(expiredIds(entries, 30, NOW)).toEqual(['old-done', 'old-cancelled'])
	})

	test('does nothing when the period is zero', () => {
		expect(expiredIds(entries, 0, NOW)).toEqual([])
	})

	test('falls back to the update time when a completion time is missing', () => {
		expect(expiredIds([entry('no-stamp', 'completed', 50, false)], 30, NOW)).toEqual(['no-stamp'])
	})
})

describe('RetentionSweeper', () => {
	test('removes expired entries, keeps the rest and says so', async () => {
		const { sweeper, removed, logs } = setup()
		expect(await sweeper.sweep()).toBe(2)
		expect(removed).toEqual(['old-done', 'old-cancelled'])
		expect(logs).toEqual(['removed 2 finished downloads older than 30 days from the list; files were kept'])
	})

	test('keeps going when one removal fails', async () => {
		const { sweeper, removed, logs } = setup({ failing: ['old-done'] })
		expect(await sweeper.sweep()).toBe(1)
		expect(removed).toEqual(['old-cancelled'])
		expect(logs.some((line) => line.includes('old-done'))).toBe(true)
	})

	test('overlapping sweeps share one run', async () => {
		const { sweeper, removed } = setup()
		const first = sweeper.sweep()
		const second = sweeper.sweep()
		expect(second).toBe(first)
		await first
		expect(removed).toHaveLength(2)
	})

	test('never rejects when the downloads cannot be read', async () => {
		const { sweeper, logs } = setup({ list: () => { throw new Error('database is closed') } })
		expect(await sweeper.sweep()).toBe(0)
		expect(logs).toEqual(['retention sweep skipped: the downloads could not be read'])
	})

	test('stays idle when disabled', async () => {
		const { sweeper, lists } = setup({ days: 0 })
		sweeper.start()
		await Bun.sleep(40)
		await sweeper.stop()
		expect(lists.count).toBe(0)
	})

	test('sweeps at startup and on a timer until stopped', async () => {
		const { sweeper, removed } = setup()
		sweeper.start()
		await waitFor(() => removed.length >= 4)
		await sweeper.stop()
		const count = removed.length
		await Bun.sleep(40)
		expect(removed.length).toBe(count)
	})
})
