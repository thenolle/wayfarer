import { describe, expect, test } from 'bun:test'
import { ConfigError, DEFAULT_TORRENT_CONFIG, loadConfig } from '../../src/config/config'

describe('torrent settings', () => {
	test('use safe defaults', () => {
		expect(loadConfig({}).torrent).toEqual(DEFAULT_TORRENT_CONFIG)
	})

	test('are read from the environment', () => {
		const torrent = loadConfig({
			WAYFARER_ARIA2_PATH: '/opt/aria2/aria2c',
			WAYFARER_TORRENT_MAX_PEERS: '200',
			WAYFARER_TORRENT_TRACKERS: 'udp://one.example.test:1337/announce, https://two.example.test/announce',
			WAYFARER_TORRENT_LISTEN_PORT: '6881-6999',
			WAYFARER_TORRENT_METADATA_TIMEOUT_MS: '30000'
		}).torrent
		expect(torrent).toEqual({ aria2Path: '/opt/aria2/aria2c', maxPeers: 200, trackers: ['udp://one.example.test:1337/announce', 'https://two.example.test/announce'], listenPort: '6881-6999', metadataTimeoutMs: 30_000 })
	})

	test.each([
		['WAYFARER_TORRENT_MAX_PEERS', '0'],
		['WAYFARER_TORRENT_MAX_PEERS', '1.5'],
		['WAYFARER_TORRENT_METADATA_TIMEOUT_MS', '10'],
		['WAYFARER_TORRENT_LISTEN_PORT', 'abc'],
		['WAYFARER_TORRENT_TRACKERS', 'not a url'],
		['WAYFARER_TORRENT_TRACKERS', 'ftp://tracker.example.test/announce']
	])('reject %s=%s', (name, value) => {
		expect(() => loadConfig({ [name]: value })).toThrow(ConfigError)
	})
})
