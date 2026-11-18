import { mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import type { DownloadsRepository } from '../database/downloads-repository'
import { allocateDestination, withDestinationLock } from '../filesystem/destination'
import { sanitizeFilename } from '../filesystem/filename'
import { DEFAULT_LOCATION_ID, LocationError, resolveDirectory } from '../filesystem/locations'
import type { DownloadLocation } from '../filesystem/locations'
import { normalizeSha256 } from './domain/checksum'
import type { DownloadRecord } from './domain/records'
import { InvalidDownloadError, isValidPriority, MAX_PRIORITY, MIN_PRIORITY } from './domain/validation'
import { filenameFromUrl } from './http/content-disposition'

const MAX_URL_LENGTH = 4096

/**
 * Raised when a download is submitted while the service is shutting down.
 */
export class ShuttingDownError extends Error {
	constructor() {
		super('The service is shutting down and is not accepting new downloads')
		this.name = 'ShuttingDownError'
	}
}

export interface AddDownloadInput {
	readonly url: string
	readonly priority?: number
	readonly expectedSha256?: string | null
	readonly filename?: string | null
	/** One of the configured location ids. Default: the main download directory. */
	readonly locationId?: string | null
	/** A folder inside the chosen location, for example `Games/PC`. */
	readonly subfolder?: string | null
}

export interface IntakeDependencies {
	readonly downloads: DownloadsRepository
	readonly downloadDir: string
	readonly locations?: readonly DownloadLocation[]
	readonly isAccepting: () => boolean
	readonly onAdded: () => void
}

/**
 * Parses and checks a download URL.
 *
 * @throws {InvalidDownloadError} when it is not an http(s) URL without credentials.
 */
export function parseDownloadUrl(text: string): URL {
	if (text.length === 0 || text.length > MAX_URL_LENGTH) throw new InvalidDownloadError(`The URL must be between 1 and ${MAX_URL_LENGTH} characters`)
	let url: URL
	try { url = new URL(text.trim()) } catch { throw new InvalidDownloadError('The URL is not valid') }
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new InvalidDownloadError('Only http and https URLs are supported')
	if (url.username !== '' || url.password !== '') throw new InvalidDownloadError('URLs with embedded credentials are not supported')
	return url
}

/**
 * Validates new download requests and queues them.
 *
 * Destinations are allocated one request at a time, so concurrent requests for
 * the same file name receive distinct names (`file.zip`, `file (1).zip`, ...).
 * The final name may still change once the server reveals its own file name.
 */
export class DownloadIntake {
	constructor(private readonly deps: IntakeDependencies) { }

	/**
	 * @throws {InvalidDownloadError} when the input is invalid.
	 * @throws {ShuttingDownError} when the service is stopping.
	 */
	add(input: AddDownloadInput): Promise<DownloadRecord> {
		return withDestinationLock(() => this.create(input))
	}

	private async directoryFor(input: AddDownloadInput): Promise<string> {
		const requested = input.locationId?.trim() ?? ''
		const locations = this.deps.locations ?? [{ id: DEFAULT_LOCATION_ID, label: 'Downloads', path: this.deps.downloadDir }]
		let directory: string
		try {
			directory = resolveDirectory(locations, requested === '' ? DEFAULT_LOCATION_ID : requested, input.subfolder ?? '')
		} catch (error) {
			if (error instanceof LocationError) throw new InvalidDownloadError(error.message)
			throw error
		}
		try {
			await mkdir(directory, { recursive: true })
		} catch {
			throw new InvalidDownloadError('That folder cannot be created or written to')
		}
		return directory
	}

	private async create(input: AddDownloadInput): Promise<DownloadRecord> {
		if (!this.deps.isAccepting()) throw new ShuttingDownError()
		const url = parseDownloadUrl(input.url)
		const priority = input.priority ?? 0
		if (!isValidPriority(priority)) throw new InvalidDownloadError(`Priority must be an integer between ${MIN_PRIORITY} and ${MAX_PRIORITY}`)
		let expectedSha256: string | null = null
		const rawChecksum = input.expectedSha256?.trim() ?? ''
		if (rawChecksum !== '') {
			expectedSha256 = normalizeSha256(rawChecksum)
			if (expectedSha256 === null) throw new InvalidDownloadError('The checksum must be a 64-character hexadecimal SHA-256 digest')
		}
		const directory = await this.directoryFor(input)
		const name = sanitizeFilename(input.filename ?? filenameFromUrl(url) ?? 'download')
		const reserved = this.deps.downloads.list().map((download) => download.destination)
		const destination = await allocateDestination(directory, name, reserved)
		const record = this.deps.downloads.create({ url: url.href, filename: basename(destination), destination, priority, expectedSha256 })
		this.deps.onAdded()
		return record
	}
}
