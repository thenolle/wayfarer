import { join, resolve } from 'node:path'
import { findClientDir } from './client-dir'
import { LocationError, parseLocations } from '../filesystem/locations'
import type { DownloadLocation } from '../filesystem/locations'

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

export interface WebhookConfig {
	readonly url: string
	readonly secret: string | null
}

export interface TorrentConfig {
	readonly aria2Path: string
	readonly maxPeers: number
	readonly trackers: readonly string[]
	readonly listenPort: string | null
	readonly metadataTimeoutMs: number
}

export const DEFAULT_TORRENT_CONFIG: TorrentConfig = {
	aria2Path: 'aria2c',
	maxPeers: 100,
	trackers: [],
	listenPort: null,
	metadataTimeoutMs: 120_000
}

export interface AppConfig {
	readonly host: string
	readonly port: number
	readonly authToken: string | null
	readonly allowedHosts: readonly string[]
	readonly dataDirectory: string
	readonly downloadDirectory: string
	readonly locations: readonly DownloadLocation[]
	readonly clientDirectory: string
	readonly databasePath: string
	readonly maxSegments: number
	readonly maxConcurrentDownloads: number
	readonly maxConcurrentSegments: number
	readonly bandwidthLimitBytesPerSecond: number
	readonly retry: RetryPolicy
	readonly requestTimeoutMs: number
	readonly persistIntervalMs: number
	readonly allowedPrivateNetworks: readonly string[]
	readonly webhook?: WebhookConfig | null
	readonly retentionDays?: number
	readonly torrent?: TorrentConfig
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '::1', '[::1]'])
const MIN_AUTH_TOKEN_LENGTH = 16
const MIN_WEBHOOK_SECRET_LENGTH = 16
const TRACKER_PROTOCOLS = new Set(['http:', 'https:', 'udp:'])

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

function readWebhook(env: Environment): WebhookConfig | null {
	const raw = readString(env, 'WAYFARER_WEBHOOK_URL')
	const secret = readString(env, 'WAYFARER_WEBHOOK_SECRET')
	if (raw === null) {
		if (secret !== null) throw new ConfigError('WAYFARER_WEBHOOK_SECRET needs WAYFARER_WEBHOOK_URL')
		return null
	}
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		throw new ConfigError('WAYFARER_WEBHOOK_URL must be a valid URL')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ConfigError('WAYFARER_WEBHOOK_URL must be an http or https URL')
	if (url.username !== '' || url.password !== '') throw new ConfigError('WAYFARER_WEBHOOK_URL must not contain a user name or password; use WAYFARER_WEBHOOK_SECRET to sign requests')
	if (secret !== null && secret.length < MIN_WEBHOOK_SECRET_LENGTH) throw new ConfigError(`WAYFARER_WEBHOOK_SECRET must be at least ${MIN_WEBHOOK_SECRET_LENGTH} characters`)
	return { url: url.href, secret }
}

function readTorrent(env: Environment): TorrentConfig {
	const listenPort = readString(env, 'WAYFARER_TORRENT_LISTEN_PORT')
	if (listenPort !== null && !/^\d{1,5}([,-]\d{1,5})*$/.test(listenPort)) throw new ConfigError('WAYFARER_TORRENT_LISTEN_PORT must be a port, a range such as 6881-6999, or a comma-separated list')
	const trackers = readList(env, 'WAYFARER_TORRENT_TRACKERS')
	for (const tracker of trackers) {
		let url: URL
		try {
			url = new URL(tracker)
		} catch {
			throw new ConfigError('WAYFARER_TORRENT_TRACKERS must be a comma-separated list of tracker URLs')
		}
		if (!TRACKER_PROTOCOLS.has(url.protocol)) throw new ConfigError('WAYFARER_TORRENT_TRACKERS entries must use http, https or udp')
	}
	return {
		aria2Path: readString(env, 'WAYFARER_ARIA2_PATH') ?? DEFAULT_TORRENT_CONFIG.aria2Path,
		maxPeers: readInteger(env, 'WAYFARER_TORRENT_MAX_PEERS', DEFAULT_TORRENT_CONFIG.maxPeers, 1, 1000),
		trackers,
		listenPort,
		metadataTimeoutMs: readInteger(env, 'WAYFARER_TORRENT_METADATA_TIMEOUT_MS', DEFAULT_TORRENT_CONFIG.metadataTimeoutMs, 5_000, 3_600_000)
	}
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
	const dataDirectory = resolve(readString(env, 'WAYFARER_DATA_DIRECTORY') ?? './data')
	const downloadDirectory = resolve(readString(env, 'WAYFARER_DOWNLOAD_DIRECTORY') ?? join(dataDirectory, 'downloads'))
	let locations: readonly DownloadLocation[]
	try {
		locations = parseLocations(downloadDirectory, readList(env, 'WAYFARER_LOCATIONS'))
	} catch (error) {
		if (error instanceof LocationError) throw new ConfigError(`WAYFARER_LOCATIONS: ${error.message}`)
		throw error
	}
	const baseDelayMs = readInteger(env, 'WAYFARER_RETRY_BASE_DELAY_MS', 500, 1, 3_600_000)
	const maxDelayMs = readInteger(env, 'WAYFARER_RETRY_MAX_DELAY_MS', 30_000, 1, 3_600_000)
	if (maxDelayMs < baseDelayMs) throw new ConfigError('WAYFARER_RETRY_MAX_DELAY_MS must not be smaller than WAYFARER_RETRY_BASE_DELAY_MS')
	return {
		host,
		port: readInteger(env, 'WAYFARER_PORT', 8787, 0, 65_535),
		authToken,
		allowedHosts,
		dataDirectory,
		downloadDirectory,
		locations,
		clientDirectory: resolve(readString(env, 'WAYFARER_CLIENT_DIRECTORY') ?? findClientDir(import.meta.dir, process.cwd())),
		databasePath: join(dataDirectory, 'wayfarer.sqlite'),
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
		allowedPrivateNetworks: readList(env, 'WAYFARER_ALLOW_PRIVATE_NETWORKS'),
		webhook: readWebhook(env),
		retentionDays: readInteger(env, 'WAYFARER_RETENTION_DAYS', 0, 0, 3_650),
		torrent: readTorrent(env),
	}
}
