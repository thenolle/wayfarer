import { join, resolve } from 'node:path'

const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]'])

/**
 * Raised when an environment variable is missing, malformed or unsafe.
 */
export class ConfigError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ConfigError'
	}
}

export type Environment = Readonly<Record<string, string | undefined>>

/**
 * Controls how transient failures are retried. Delays grow exponentially from
 * `baseDelayMs` up to `maxDelayMs`, with random jitter of up to
 * `jitterRatio` of the delay.
 */
export interface RetryPolicy {
	readonly maxAttempts: number
	readonly baseDelayMs: number
	readonly maxDelayMs: number
	readonly jitterRatio: number
}

export interface AppConfig {
	readonly host: string
	readonly port: number
	readonly authToken: string | null
	readonly allowedHosts: readonly string[]
	readonly dataDirectory: string
	readonly downloadDirectory: string
	readonly databasePath: string
	readonly maxSegments: number
	readonly maxConcurrentDownloads: number
	readonly maxConcurrentSegments: number
	readonly bandwidthLimitBytesPerSecond: number
	readonly retry: RetryPolicy
	readonly requestTimeoutMs: number
	readonly persistIntervalMs: number
	readonly allowedPrivateNetworks: readonly string[]
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '::1', '[::1]'])
const MIN_AUTH_TOKEN_LENGTH = 16

/**
 * Returns true when `host` only accepts connections from the local machine.
 */
export function isLoopbackHost(host: string): boolean {
	const normalized = host.trim().toLowerCase()
	return LOOPBACK_HOSTNAMES.has(normalized) || /^127(\.\d{1,3}){3}$/.test(normalized)
}

/**
 * Returns true when `host` listens on every network interface.
 */
export function isWildcardHost(host: string): boolean {
	return WILDCARD_HOSTS.has(host.trim().toLowerCase())
}

function readString(env: Environment, name: string): string | null {
	const raw = env[name]
	if (raw === undefined) return null
	const trimmed = raw.trim()
	return trimmed === '' ? null : trimmed
}

function readNumber(env: Environment, name: string, fallback: number, min: number, max: number): number {
	const raw = readString(env, name)
	if (raw === null) return fallback
	const value = Number(raw)
	if (!Number.isFinite(value) || value < min || value > max) throw new ConfigError(`${name} must be a number between ${min} and ${max}`)
	return value
}

function readInteger(env: Environment, name: string, fallback: number, min: number, max: number): number {
	const value = readNumber(env, name, fallback, min, max)
	if (!Number.isInteger(value)) throw new ConfigError(`${name} must be an integer`)
	return value
}

function readList(env: Environment, name: string): readonly string[] {
	const raw = readString(env, name)
	if (raw === null) return []
	return raw.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '')
}

/**
 * Builds the application configuration from environment variables.
 *
 * Binding to a non-loopback address requires `WAYFARER_AUTH_TOKEN` so that a
 * network-exposed service is never left unauthenticated.
 *
 * @throws {ConfigError} when a value is invalid or the combination is unsafe.
 */
export function loadConfig(env: Environment = process.env): AppConfig {
	const host = readString(env, 'WAYFARER_HOST') ?? '127.0.0.1'
	const authToken = readString(env, 'WAYFARER_AUTH_TOKEN')
	if (authToken !== null && authToken.length < MIN_AUTH_TOKEN_LENGTH) throw new ConfigError(`WAYFARER_AUTH_TOKEN must be at least ${MIN_AUTH_TOKEN_LENGTH} characters`)
	if (!isLoopbackHost(host) && authToken === null) throw new ConfigError('WAYFARER_AUTH_TOKEN is required when WAYFARER_HOST is not a loopback address')
	const allowedHosts = readList(env, 'WAYFARER_ALLOWED_HOSTS').map((entry) => entry.toLowerCase())
	if (isWildcardHost(host) && allowedHosts.length === 0) throw new ConfigError('WAYFARER_ALLOWED_HOSTS is required when WAYFARER_HOST is a wildcard address')
	const dataDir = resolve(readString(env, 'WAYFARER_DATA_DIRECTORY') ?? './data')
	const downloadDir = resolve(readString(env, 'WAYFARER_DOWNLOAD_DIRECTORY') ?? join(dataDir, 'downloads'))
	const baseDelayMs = readInteger(env, 'WAYFARER_RETRY_BASE_DELAY_MS', 500, 1, 3_600_000)
	const maxDelayMs = readInteger(env, 'WAYFARER_RETRY_MAX_DELAY_MS', 30_000, 1, 3_600_000)
	if (maxDelayMs < baseDelayMs) throw new ConfigError('WAYFARER_RETRY_MAX_DELAY_MS must not be smaller than WAYFARER_RETRY_BASE_DELAY_MS')
	return {
		host,
		port: readInteger(env, 'WAYFARER_PORT', 8787, 0, 65_535),
		authToken,
		allowedHosts,
		dataDirectory: dataDir,
		downloadDirectory: downloadDir,
		databasePath: join(dataDir, 'wayfarer.sqlite'),
		maxSegments: readInteger(env, 'WAYFARER_MAX_SEGMENTS', 8, 1, 64),
		maxConcurrentDownloads: readInteger(env, 'WAYFARER_MAX_CONCURRENT_DOWNLOADS', 3, 1, 64),
		maxConcurrentSegments: readInteger(env, 'WAYFARER_MAX_CONCURRENT_SEGMENTS', 16, 1, 256),
		bandwidthLimitBytesPerSecond: readInteger(env, 'WAYFARER_BANDWIDTH_LIMIT', 0, 0, Number.MAX_SAFE_INTEGER),
		retry: {
			maxAttempts: readInteger(env, 'WAYFARER_RETRY_MAX_ATTEMPTS', 5, 1, 100),
			baseDelayMs,
			maxDelayMs,
			jitterRatio: readNumber(env, 'WAYFARER_RETRY_JITTER', 0.2, 0, 1)
		},
		requestTimeoutMs: readInteger(env, 'WAYFARER_REQUEST_TIMEOUT_MS', 30_000, 1_000, 3_600_000),
		persistIntervalMs: readInteger(env, 'WAYFARER_PERSIST_INTERVAL_MS', 250, 50, 60_000),
		allowedPrivateNetworks: readList(env, 'WAYFARER_ALLOW_PRIVATE_NETWORKS')
	}
}
