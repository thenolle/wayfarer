import { describe, expect, test } from 'bun:test'
import { parseLiveMessage } from '../../src/shared/live-protocol'
import type { DownloadLive } from '../../src/shared/live-protocol'

const download: DownloadLive = {
	id: 'a',
	status: 'downloading',
	downloadedBytes: 10,
	totalBytes: 100,
	progress: 0.1,
	speedBytesPerSecond: 5,
	etaSeconds: 18,
	retryCount: 0,
	error: null,
	segments: [{ index: 0, downloadedBytes: 10, totalBytes: 100, status: 'active' }]
}

describe('parseLiveMessage', () => {
	test('accepts snapshots and updates', () => {
		const snapshot = JSON.stringify({ type: 'snapshot', version: 1, downloads: [download] })
		expect(parseLiveMessage(snapshot)).toEqual({ type: 'snapshot', version: 1, downloads: [download] })
		const update = JSON.stringify({ type: 'update', version: 1, downloads: [download], removed: ['b'] })
		expect(parseLiveMessage(update)).toEqual({ type: 'update', version: 1, downloads: [download], removed: ['b'] })
	})

	test('rejects malformed or unsupported messages', () => {
		expect(parseLiveMessage('not json')).toBeNull()
		expect(parseLiveMessage('[]')).toBeNull()
		expect(parseLiveMessage(JSON.stringify({ type: 'snapshot', version: 2, downloads: [] }))).toBeNull()
		expect(parseLiveMessage(JSON.stringify({ type: 'snapshot', version: 1, downloads: [{ ...download, id: 5 }] }))).toBeNull()
		expect(parseLiveMessage(JSON.stringify({ type: 'snapshot', version: 1, downloads: [{ ...download, segments: [{}] }] }))).toBeNull()
		expect(parseLiveMessage(JSON.stringify({ type: 'update', version: 1, downloads: [], removed: [1] }))).toBeNull()
		expect(parseLiveMessage(JSON.stringify({ type: 'other', version: 1, downloads: [] }))).toBeNull()
	})
})
