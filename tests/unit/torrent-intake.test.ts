import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { InvalidDownloadError } from '../../src/downloads/domain/validation'
import { DuplicateDownloadError, ShuttingDownError } from '../../src/downloads/intake'
import { fetchTorrentFile, TorrentAwareIntake } from '../../src/downloads/torrent/intake'
import type { GuardedFetch } from '../../src/downloads/http/guarded-fetch'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'
import { buildTorrent } from '../helpers/torrent'

const HASH = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a'
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Some%20Show&tr=udp%3A%2F%2Ftracker.example.test%3A1337`

let context: TestContext
let accepting = true
let added = 0
let saved: Map<string, Uint8Array>
let fetched: URL[]
let remote: Uint8Array
let intake: TorrentAwareIntake

beforeEach(async () => {
	context = await createTestContext()
	accepting = true
	added = 0
	saved = new Map()
	fetched = []
	remote = buildTorrent({ name: 'remote.bin' }).bytes
	intake = new TorrentAwareIntake(
		{ downloads: context.downloads, downloadDirectory: join(context.directory, 'downloads'), isAccepting: () => accepting, onAdded: () => { added += 1 } },
		{
			store: { save: async (hash, bytes) => { saved.set(hash, bytes) } },
			fetchTorrent: async (url) => { fetched.push(url); return remote }
		}
	)
})

afterEach(async () => {
	await context.dispose()
})

describe('TorrentAwareIntake magnet links', () => {
	test('queues a torrent record named after the magnet link', async () => {
		const record = await intake.add({ url: MAGNET })
		expect(record.status).toBe('queued')
		expect(record.resolver).toBe('torrent')
		expect(record.filename).toBe('Some Show')
		expect(record.url.startsWith(`magnet:?xt=urn:btih:${HASH}`)).toBe(true)
		expect(record.url).toContain('tr=')
		expect(added).toBe(1)
	})

	test('falls back to the info hash when the link has no name', async () => {
		expect((await intake.add({ url: `magnet:?xt=urn:btih:${HASH}` })).filename).toBe(HASH)
	})

	test('detects the same torrent written differently, unless duplicates are allowed', async () => {
		await intake.add({ url: MAGNET })
		expect(intake.add({ url: `magnet:?xt=urn:btih:${HASH.toUpperCase()}` })).rejects.toBeInstanceOf(DuplicateDownloadError)
		expect((await intake.add({ url: `magnet:?xt=urn:btih:${HASH}`, allowDuplicate: true })).filename).toBe(HASH)
		expect(context.downloads.list()).toHaveLength(2)
	})

	test.each([
		['a bad link', { url: 'magnet:?dn=nothing' }],
		['a file name', { url: MAGNET, filename: 'x.bin' }],
		['a checksum', { url: MAGNET, expectedSha256: 'ab'.repeat(32) }],
		['a bad priority', { url: MAGNET, priority: 1000 }]
	])('rejects %s', async (_label, input) => {
		expect(intake.add(input)).rejects.toBeInstanceOf(InvalidDownloadError)
		expect(context.downloads.list()).toHaveLength(0)
	})

	test('refuses new torrents while shutting down', async () => {
		accepting = false
		expect(intake.add({ url: MAGNET })).rejects.toBeInstanceOf(ShuttingDownError)
	})
})

describe('TorrentAwareIntake .torrent files', () => {
	test('stores the file and queues it without leaking trackers', async () => {
		const built = buildTorrent({ name: 'movie.mkv', length: 5000, announce: 'https://tracker.example.test/announce?passkey=secret' })
		const record = await intake.addTorrentFile(built.bytes)
		expect(saved.get(built.infoHash)).toEqual(built.bytes)
		expect(record.filename).toBe('movie.mkv')
		expect(record.totalBytes).toBe(5000)
		expect(record.url).toBe(`magnet:?xt=urn:btih:${built.infoHash}&dn=movie.mkv`)
		expect(record.url).not.toContain('secret')
	})

	test('gives torrents with the same name distinct destinations', async () => {
		const first = await intake.addTorrentFile(buildTorrent({ name: 'same.bin', length: 1 }).bytes)
		const second = await intake.addTorrentFile(buildTorrent({ name: 'same.bin', length: 2 }).bytes)
		expect([first.filename, second.filename].sort()).toEqual(['same (1).bin', 'same.bin'])
	})

	test('rejects invalid files', async () => {
		expect(intake.addTorrentFile(new TextEncoder().encode('nope'))).rejects.toBeInstanceOf(InvalidDownloadError)
		expect(context.downloads.list()).toHaveLength(0)
	})

	test('fetches .torrent links and queues the torrent inside', async () => {
		const record = await intake.add({ url: 'https://example.test/files/remote.torrent' })
		expect(fetched.map((url) => url.href)).toEqual(['https://example.test/files/remote.torrent'])
		expect(record.resolver).toBe('torrent')
		expect(record.filename).toBe('remote.bin')
	})

	test('leaves ordinary links to the normal intake', async () => {
		const record = await intake.add({ url: 'https://example.test/archive.zip' })
		expect(record.resolver).toBeNull()
		expect(record.filename).toBe('archive.zip')
		expect(fetched).toHaveLength(0)
	})
})

describe('fetchTorrentFile', () => {
	function answer(body: Uint8Array, status = 200): GuardedFetch {
		const bytes = new Uint8Array(body)
		return async (url) => ({ response: new Response(bytes.buffer as ArrayBuffer, { status }), url: new URL(url), abort: () => undefined })
	}

	test('returns the bytes of the file', async () => {
		const built = buildTorrent()
		expect(await fetchTorrentFile(answer(built.bytes), new URL('https://example.test/a.torrent'), 1000)).toEqual(built.bytes)
	})

	test('refuses error responses and oversized files', async () => {
		expect(fetchTorrentFile(answer(new Uint8Array(1), 404), new URL('https://example.test/a.torrent'), 1000)).rejects.toBeInstanceOf(InvalidDownloadError)
		expect(fetchTorrentFile(answer(new Uint8Array(9 * 1024 * 1024)), new URL('https://example.test/a.torrent'), 1000)).rejects.toBeInstanceOf(InvalidDownloadError)
	})
})
