import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { ConfigError, loadConfig } from '../../src/config/config'

describe('loadConfig', () => {
	test('uses secure defaults', () => {
		const config = loadConfig({})
		expect(config.host).toBe('127.0.0.1')
		expect(config.maxSegments).toBe(8)
		expect(config.authToken).toBeNull()
		expect(config.allowedHosts).toEqual([])
		expect(config.databasePath).toBe(join(config.dataDirectory, 'wayfarer.sqlite'))
	})

	test('requires a token on non-loopback hosts', () => {
		expect(() => loadConfig({ WAYFARER_HOST: '192.168.1.5' })).toThrow(ConfigError)
		expect(loadConfig({ WAYFARER_HOST: '192.168.1.5', WAYFARER_AUTH_TOKEN: 'x'.repeat(16) }).host).toBe('192.168.1.5')
	})

	test('requires allowed host names for wildcard addresses', () => {
		const token = 'x'.repeat(16)
		expect(() => loadConfig({ WAYFARER_HOST: '0.0.0.0', WAYFARER_AUTH_TOKEN: token })).toThrow(ConfigError)
		expect(() => loadConfig({ WAYFARER_HOST: '::', WAYFARER_AUTH_TOKEN: token })).toThrow(ConfigError)
		const config = loadConfig({ WAYFARER_HOST: '0.0.0.0', WAYFARER_AUTH_TOKEN: token, WAYFARER_ALLOWED_HOSTS: 'Downloads.Example.com, nas.local' })
		expect(config.allowedHosts).toEqual(['downloads.example.com', 'nas.local'])
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
