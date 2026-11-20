import { basename } from 'node:path'
import { allocateDestination, withDestinationLock } from '../../filesystem/destination'
import { sanitizeFilename } from '../../filesystem/filename'
import type { DownloadRecord } from '../domain/records'
import { InvalidDownloadError, isValidPriority, MAX_PRIORITY, MIN_PRIORITY } from '../domain/validation'
import { BlockedDestinationError } from '../http/errors'
import type { GuardedFetch } from '../http/guarded-fetch'
import { DownloadIntake, DuplicateDownloadError, parseDownloadUrl, ShuttingDownError } from '../intake'
import type { AddDownloadInput, IntakeDependencies } from '../intake'
import type { LinkPreview } from '../inspect'
import { canonicalMagnet, isMagnetLink, isTorrentUrl, MAX_TORRENT_BYTES, parseMagnet, parseTorrentFile, TORRENT_RESOLVER } from './metadata'
import type { TorrentMetadata } from './metadata'
import { pathExists } from './store'
import type { TorrentStore } from './store'

export type FetchTorrent = (url: URL) => Promise<Uint8Array>

export interface TorrentIntakeExtras {
	readonly store: Pick<TorrentStore, 'save'>
	readonly fetchTorrent: FetchTorrent
}

/**
 * Downloads a `.torrent` file through the guarded fetch, so the network policy
 * applies, and refuses anything larger than the size limit.
 *
 * @throws {InvalidDownloadError} when the file cannot be fetched.
 */
export async function fetchTorrentFile(fetch: GuardedFetch, url: URL, timeoutMs: number): Promise<Uint8Array> {
	try {
		const { response, abort } = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
		if (!response.ok) {
			abort()
			throw new InvalidDownloadError(`The server answered ${response.status} for that .torrent link`)
		}
		const reader = response.body?.getReader()
		if (reader === undefined) throw new InvalidDownloadError('The .torrent link returned nothing')
		const chunks: Uint8Array[] = []
		let total = 0
		for (; ;) {
			const { done, value } = await reader.read()
			if (done) break
			total += value.byteLength
			if (total > MAX_TORRENT_BYTES) {
				abort()
				throw new InvalidDownloadError('That .torrent file is too large')
			}
			chunks.push(value)
		}
		return new Uint8Array(Buffer.concat(chunks))
	} catch (error) {
		if (error instanceof InvalidDownloadError || error instanceof BlockedDestinationError) throw error
		throw new InvalidDownloadError('The .torrent file could not be downloaded')
	}
}

/**
 * Describes a magnet link or `.torrent` link for the dashboard's link check.
 */
export async function inspectTorrentLink(text: string, extras: Pick<TorrentIntakeExtras, 'fetchTorrent'>): Promise<LinkPreview> {
	const metadata = isMagnetLink(text) ? parseMagnet(text) : parseTorrentFile(await extras.fetchTorrent(parseDownloadUrl(text)))
	return {
		filename: sanitizeFilename(metadata.name ?? `Torrent ${metadata.infoHash.slice(0, 8)}`),
		totalBytes: metadata.totalBytes,
		acceptsRanges: false,
		resolver: TORRENT_RESOLVER
	}
}

function sameTorrent(link: string, infoHash: string): boolean {
	try {
		return parseMagnet(link).infoHash === infoHash
	} catch {
		return false
	}
}

/**
 * The normal intake, extended to accept magnet links, `.torrent` links and
 * `.torrent` files. Everything else goes through the parent unchanged.
 *
 * A torrent is stored as a magnet link on a record marked with the `torrent`
 * resolver. The record is created and marked in the same tick, so the
 * scheduler never sees it unmarked.
 */
export class TorrentAwareIntake extends DownloadIntake {
	constructor(deps: IntakeDependencies, private readonly extras: TorrentIntakeExtras) {
		super(deps)
	}

	override async add(input: AddDownloadInput): Promise<DownloadRecord> {
		const link = input.url.trim()
		if (isMagnetLink(link)) {
			const metadata = parseMagnet(link)
			return this.enqueue(metadata, input, canonicalMagnet(metadata, true))
		}
		if (isTorrentUrl(link)) return this.addTorrentFile(await this.extras.fetchTorrent(parseDownloadUrl(link)), input)
		return super.add(input)
	}

	/**
	 * Queues the torrent described by a `.torrent` file. The file is stored by
	 * info hash before the download is queued, so the runner always finds it.
	 *
	 * @throws {InvalidDownloadError} when the file or the options are invalid.
	 */
	async addTorrentFile(bytes: Uint8Array, options: Omit<AddDownloadInput, 'url'> = {}): Promise<DownloadRecord> {
		const metadata = parseTorrentFile(bytes)
		await this.extras.store.save(metadata.infoHash, bytes)
		return this.enqueue(metadata, { ...options, url: '' }, canonicalMagnet(metadata, false))
	}

	private enqueue(metadata: TorrentMetadata, input: AddDownloadInput, url: string): Promise<DownloadRecord> {
		return withDestinationLock(async () => {
			if (!this.deps.isAccepting()) throw new ShuttingDownError()
			const priority = input.priority ?? 0
			if (!isValidPriority(priority)) throw new InvalidDownloadError(`Priority must be an integer between ${MIN_PRIORITY} and ${MAX_PRIORITY}`)
			if ((input.filename ?? '').trim() !== '') throw new InvalidDownloadError('Torrents keep the name they were published with, so a file name cannot be set')
			if ((input.expectedSha256 ?? '').trim() !== '') throw new InvalidDownloadError('Checksums are not used for torrents; every piece is verified automatically')
			if (input.allowDuplicate !== true) {
				const duplicate = await this.findTorrentDuplicate(metadata.infoHash)
				if (duplicate !== null) throw new DuplicateDownloadError(duplicate)
			}
			const directory = await this.directoryFor(input)
			const name = sanitizeFilename(metadata.name ?? metadata.infoHash)
			const reserved = this.deps.downloads.list().map((download) => download.destination)
			const destination = await allocateDestination(directory, name, reserved)
			const created = this.deps.downloads.create({ url, filename: basename(destination), destination, priority })
			const record = this.deps.downloads.update(created.id, {
				resolver: TORRENT_RESOLVER,
				totalBytes: metadata.totalBytes,
				resolvedMetadata: JSON.stringify({ infoHash: metadata.infoHash, files: metadata.fileCount })
			})
			this.deps.onAdded()
			return record
		})
	}

	private async findTorrentDuplicate(infoHash: string): Promise<DownloadRecord | null> {
		for (const record of this.deps.downloads.list()) {
			if (record.status === 'failed' || record.status === 'cancelled' || !isMagnetLink(record.url) || !sameTorrent(record.url, infoHash)) continue
			if (record.status === 'completed' && !(await pathExists(record.destination))) continue
			return record
		}
		return null
	}
}
