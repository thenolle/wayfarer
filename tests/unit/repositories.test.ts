import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { SettingsRepository } from '../../src/database/settings-repository'
import { DownloadNotFoundError, InvalidTransitionError } from '../../src/downloads/domain/errors'
import { planSegments } from '../../src/downloads/segments/plan'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'

let context: TestContext

beforeEach(async () => {
	context = await createTestContext()
})

afterEach(async () => {
	await context.dispose()
})

function createDownload(name = 'file.bin') {
	return context.downloads.create({ url: `https://example.test/${name}`, filename: name, destination: `${context.directory}/${name}` })
}

describe('database setup', () => {
	test('enables WAL and foreign keys', () => {
		const mode = context.database.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get()
		const keys = context.database.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()
		expect(mode?.journal_mode).toBe('wal')
		expect(keys?.foreign_keys).toBe(1)
	})

	test('persists the schema version', () => {
		const row = context.database.query<{ user_version: number }, []>('PRAGMA user_version').get()
		expect(row?.user_version).toBe(1)
	})
})

describe('DownloadsRepository', () => {
	test('creates queued downloads with defaults', () => {
		const download = createDownload()
		expect(download.status).toBe('queued')
		expect(download.downloadedBytes).toBe(0)
		expect(download.priority).toBe(0)
		expect(context.downloads.get(download.id)).toEqual(download)
	})

	test('rejects destinations that differ only by case', () => {
		createDownload('Movie.mkv')
		expect(() => context.downloads.create({ url: 'https://example.test/x', filename: 'x', destination: `${context.directory}/movie.MKV` })).toThrow()
	})

	test('enforces the state machine and records completion time', () => {
		const download = createDownload()
		expect(() => context.downloads.setStatus(download.id, 'completed')).toThrow(InvalidTransitionError)
		context.downloads.setStatus(download.id, 'probing')
		context.downloads.setStatus(download.id, 'downloading')
		const completed = context.downloads.setStatus(download.id, 'completed', { downloadedBytes: 10 })
		expect(completed.completedAt).not.toBeNull()
		expect(completed.downloadedBytes).toBe(10)
	})

	test('rolls back a status change when its patch fails', () => {
		const first = createDownload('a.bin')
		const second = createDownload('b.bin')
		expect(() => context.downloads.setStatus(second.id, 'probing', { destination: first.destination })).toThrow()
		expect(context.downloads.require(second.id).status).toBe('queued')
	})

	test('saves progress only for downloading items', () => {
		const download = createDownload()
		const sample = { id: download.id, downloadedBytes: 500, speedBytesPerSecond: 100, etaSeconds: 5 }
		context.downloads.saveProgress([sample])
		expect(context.downloads.require(download.id).downloadedBytes).toBe(0)
		context.downloads.setStatus(download.id, 'probing')
		context.downloads.setStatus(download.id, 'downloading')
		context.downloads.saveProgress([sample])
		expect(context.downloads.require(download.id).downloadedBytes).toBe(500)
		context.downloads.setStatus(download.id, 'paused')
		context.downloads.saveProgress([{ ...sample, downloadedBytes: 900 }])
		expect(context.downloads.require(download.id).downloadedBytes).toBe(500)
	})

	test('lists by priority then age', () => {
		const low = createDownload('low.bin')
		const high = context.downloads.create({ url: 'https://example.test/high.bin', filename: 'high.bin', destination: `${context.directory}/high.bin`, priority: 5 })
		expect(context.downloads.list().map((item) => item.id)).toEqual([high.id, low.id])
	})

	test('reports missing downloads', () => {
		expect(context.downloads.get('missing')).toBeNull()
		expect(() => context.downloads.require('missing')).toThrow(DownloadNotFoundError)
		expect(context.downloads.delete('missing')).toBe(false)
	})
})

describe('SegmentsRepository', () => {
	const total = 4 * 1024 * 1024

	test('stores planned segments and cascades on delete', () => {
		const download = createDownload()
		const stored = context.segments.replace(download.id, planSegments(total, 4))
		expect(stored).toHaveLength(4)
		expect(stored.every((segment) => segment.durableOffset === segment.startOffset)).toBe(true)
		expect(context.downloads.delete(download.id)).toBe(true)
		expect(context.segments.list(download.id)).toEqual([])
	})

	test('never moves a durable offset backwards', () => {
		const download = createDownload()
		const [first] = context.segments.replace(download.id, planSegments(total, 4))
		expect(first).toBeDefined()
		if (first === undefined) return
		context.segments.saveDurable([{ id: first.id, durableOffset: 5000, status: 'active' }])
		context.segments.saveDurable([{ id: first.id, durableOffset: 100, status: 'active' }])
		expect(context.segments.list(download.id)[0]?.durableOffset).toBe(5000)
	})

	test('rejects offsets beyond the segment end', () => {
		const download = createDownload()
		const [first] = context.segments.replace(download.id, planSegments(total, 4))
		if (first === undefined) throw new Error('segment missing')
		expect(() => context.segments.saveDurable([{ id: first.id, durableOffset: first.endOffset + 2, status: 'active' }])).toThrow()
	})

	test('counts retries', () => {
		const download = createDownload()
		const [first] = context.segments.replace(download.id, planSegments(total, 4))
		if (first === undefined) throw new Error('segment missing')
		context.segments.recordRetry(first.id, 'connection reset')
		const saved = context.segments.list(download.id)[0]
		expect(saved?.retryCount).toBe(1)
		expect(saved?.errorMessage).toBe('connection reset')
	})
})

describe('SettingsRepository', () => {
	test('stores and updates the bandwidth limit', () => {
		const settings = new SettingsRepository(context.database)
		expect(settings.getBandwidthLimit()).toBeNull()
		settings.setBandwidthLimit(1_000_000)
		settings.setBandwidthLimit(2_000_000)
		expect(settings.getBandwidthLimit()).toBe(2_000_000)
		expect(() => settings.setBandwidthLimit(-1)).toThrow(RangeError)
	})
})
