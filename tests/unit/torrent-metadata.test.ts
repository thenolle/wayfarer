import { describe, expect, test } from 'bun:test'
import { InvalidDownloadError } from '../../src/downloads/domain/validation'
import { canonicalMagnet, isMagnetLink, isTorrentUrl, MAX_TORRENT_BYTES, parseMagnet, parseTorrentFile } from '../../src/downloads/torrent/metadata'
import { buildTorrent } from '../helpers/torrent'

const HASH = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a'

describe('parseMagnet', () => {
	test('reads a hex info hash, name and trackers', () => {
		const metadata = parseMagnet(`magnet:?xt=urn:btih:${HASH.toUpperCase()}&dn=Some+Show&tr=udp%3A%2F%2Ftracker.example.test%3A1337&tr=not-a-url`)
		expect(metadata.infoHash).toBe(HASH)
		expect(metadata.name).toBe('Some Show')
		expect(metadata.trackers).toEqual(['udp://tracker.example.test:1337'])
	})

	test('converts a base32 info hash', () => {
		expect(parseMagnet(`magnet:?xt=urn:btih:${'A'.repeat(32)}`).infoHash).toBe('0'.repeat(40))
		expect(parseMagnet(`magnet:?xt=urn:btih:${'7'.repeat(32)}`).infoHash).toBe('f'.repeat(40))
	})

	test.each([
		['https://example.test/file'],
		['magnet:?dn=only-a-name'],
		['magnet:?xt=urn:btih:zzz'],
		['magnet:?xt=urn:btmh:1220abcdef']
	])('rejects %s', (link) => {
		expect(() => parseMagnet(link)).toThrow(InvalidDownloadError)
	})
})

describe('link detection', () => {
	test('recognises magnet links and .torrent URLs', () => {
		expect(isMagnetLink('  MAGNET:?xt=urn:btih:abc')).toBe(true)
		expect(isMagnetLink('https://example.test/a')).toBe(false)
		expect(isTorrentUrl('https://example.test/files/a.TORRENT?x=1')).toBe(true)
		expect(isTorrentUrl('https://example.test/a.zip')).toBe(false)
		expect(isTorrentUrl('ftp://example.test/a.torrent')).toBe(false)
	})
})

describe('canonicalMagnet', () => {
	test('keeps trackers only when asked', () => {
		const metadata = { infoHash: HASH, name: 'A & B', totalBytes: null, fileCount: null, trackers: ['udp://t.example.test:1'] }
		expect(canonicalMagnet(metadata, false)).toBe(`magnet:?xt=urn:btih:${HASH}&dn=A%20%26%20B`)
		expect(canonicalMagnet(metadata, true)).toBe(`magnet:?xt=urn:btih:${HASH}&dn=A%20%26%20B&tr=udp%3A%2F%2Ft.example.test%3A1`)
	})
})

describe('parseTorrentFile', () => {
	test('reads a single-file torrent and computes the info hash', () => {
		const built = buildTorrent({ name: 'a.bin', length: 1234, announce: 'udp://tracker.example.test:1337/announce' })
		const metadata = parseTorrentFile(built.bytes)
		expect(metadata.infoHash).toBe(built.infoHash)
		expect(metadata.name).toBe('a.bin')
		expect(metadata.totalBytes).toBe(1234)
		expect(metadata.fileCount).toBe(1)
		expect(metadata.trackers).toEqual(['udp://tracker.example.test:1337/announce'])
	})

	test('adds up the files of a multi-file torrent', () => {
		const built = buildTorrent({ name: 'Show', files: [{ length: 100, path: ['a', 'b.txt'] }, { length: 200, path: ['c.txt'] }] })
		const metadata = parseTorrentFile(built.bytes)
		expect(metadata.totalBytes).toBe(300)
		expect(metadata.fileCount).toBe(2)
	})

	test('rejects v2-only, garbage, empty and oversized files', () => {
		expect(() => parseTorrentFile(buildTorrent({ withoutPieces: true }).bytes)).toThrow(InvalidDownloadError)
		expect(() => parseTorrentFile(new TextEncoder().encode('this is not a torrent'))).toThrow(InvalidDownloadError)
		expect(() => parseTorrentFile(new Uint8Array(0))).toThrow(InvalidDownloadError)
		expect(() => parseTorrentFile(new Uint8Array(MAX_TORRENT_BYTES + 1))).toThrow(InvalidDownloadError)
	})
})
