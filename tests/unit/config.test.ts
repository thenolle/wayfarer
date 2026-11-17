import { describe, expect, test } from 'bun:test'
import { ConfigError, loadConfig } from '../../src/config/config'

describe('loadConfig', () => {
	test('uses secure defaults', () => {
		const config = loadConfig({})
		expect(config.host).toBe('127.0.0.1')
		expect(config.maxSegments).toBe(8)
		expect(config.authToken).toBeNull()
		expect(config.databasePath.endsWith('wayfarer.db')).toBe(true)
	})

	test('requires a token on non-loopback hosts', () => {
		expect(() => loadConfig({ WAYFARER_HOST: '0.0.0.0' })).toThrow(ConfigError)
		expect(loadConfig({ WAYFARER_HOST: '0.0.0.0', WAYFARER_AUTH_TOKEN: 'x'.repeat(16) }).host).toBe('0.0.0.0')
	})

	test('rejects short tokens and out-of-range numbers', () => {
		expect(() => loadConfig({ WAYFARER_AUTH_TOKEN: 'short' })).toThrow(ConfigError)
		expect(() => loadConfig({ WAYFARER_MAX_SEGMENTS: '0' })).toThrow(ConfigError)
		expect(() => loadConfig({ WAYFARER_PORT: '1.5' })).toThrow(ConfigError)
		expect(() => loadConfig({ WAYFARER_PORT: 'abc' })).toThrow(ConfigError)
	})

	test('rejects inverted retry delays', () => {
		expect(() => loadConfig({ WAYFARER_RETRY_BASE_DELAY_MS: '5000', WAYFARER_RETRY_MAX_DELAY_MS: '1000' })).toThrow(ConfigError)
	})

	test('parses private network allow lists', () => {
		expect(loadConfig({ WAYFARER_ALLOW_PRIVATE_NETWORKS: ' 10.0.0.0/8 , nas.local ,' }).allowedPrivateNetworks).toEqual(['10.0.0.0/8', 'nas.local'])
	})
})
