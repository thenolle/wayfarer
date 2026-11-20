import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { DownloadsRepository } from '../../database/downloads-repository'
import { allocateDestination, withDestinationLock } from '../../filesystem/destination'
import { isErrnoException } from '../../filesystem/errors'
import { sanitizeFilename } from '../../filesystem/filename'
import type { DownloadRecord } from '../domain/records'
import { isActiveStatus } from '../domain/status'
import { InvalidDownloadError } from '../domain/validation'
import type { RunOutcome } from '../engine/engine'
import type { DownloadRunner } from '../scheduler/scheduler'
import { Aria2Error, asNumber, asRecord, asText } from './aria2'
import type { Aria2Daemon } from './aria2'
import { parseMagnet } from './metadata'
import { pathExists, stagingDirectory } from './store'
import type { TorrentStore } from './store'

const STATUS_KEYS = ['status', 'totalLength', 'completedLength', 'downloadSpeed', 'errorCode', 'errorMessage', 'followedBy', 'bittorrent']
const MOVE_RETRIES = 10

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
	'9': 'There is not enough free disk space for this torrent',
	'12': 'This torrent is already being downloaded by the engine',
	'25': 'The torrent data could not be read',
	'26': 'The torrent file is not valid',
	'27': 'The magnet link is not valid'
}

/**
 * A failure of a torrent with a stable code and a message safe to show.
 */
export class TorrentFailure extends Error {
	constructor(readonly code: string, message: string) {
		super(message)
		this.name = 'TorrentFailure'
	}
}

interface Aria2Status {
	readonly state: string
	readonly totalBytes: number
	readonly completedBytes: number
	readonly speed: number
	readonly errorCode: string | null
	readonly errorMessage: string | null
	readonly followedBy: string | null
	readonly name: string | null
}

function parseStatus(value: unknown): Aria2Status {
	const data = asRecord(value)
	if (data === null) throw new Aria2Error('The torrent engine sent an unexpected answer')
	const followed: unknown = Array.isArray(data['followedBy']) ? data['followedBy'][0] : undefined
	const info = asRecord(asRecord(data['bittorrent'])?.['info'])
	return {
		state: asText(data['status']) ?? 'unknown',
		totalBytes: asNumber(data['totalLength']),
		completedBytes: asNumber(data['completedLength']),
		speed: asNumber(data['downloadSpeed']),
		errorCode: asText(data['errorCode']),
		errorMessage: asText(data['errorMessage']),
		followedBy: typeof followed === 'string' ? followed : null,
		name: asText(info?.['name'])
	}
}

function isComplete(status: Aria2Status): boolean {
	return status.totalBytes > 0 && (status.state === 'complete' || status.completedBytes >= status.totalBytes)
}

function describeStatusError(status: Aria2Status): TorrentFailure {
	const known = status.errorCode === null ? undefined : ERROR_MESSAGES[status.errorCode]
	return new TorrentFailure(`torrent_error_${status.errorCode ?? 'unknown'}`, known ?? `The torrent engine reported an error: ${status.errorMessage ?? 'unknown error'}`)
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve()
			return
		}
		const timer = setTimeout(done, milliseconds)
		function done(): void {
			clearTimeout(timer)
			signal.removeEventListener('abort', done)
			resolve()
		}
		signal.addEventListener('abort', done, { once: true })
	})
}

async function moveWithRetry(source: string, destination: string): Promise<void> {
	for (let attempt = 0; ; attempt += 1) {
		try {
			await rename(source, destination)
			return
		} catch (error) {
			const busy = isErrnoException(error) && (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES')
			if (!busy || attempt >= MOVE_RETRIES) throw error
			await Bun.sleep(300)
		}
	}
}

/**
 * Removes what a torrent keeps outside the final destination. Used when a
 * download is cancelled or removed before it completed.
 */
export async function discardTorrentData(record: DownloadRecord): Promise<void> {
	if (!record.url.startsWith('magnet:')) return
	await rm(stagingDirectory(record.destination, record.id), { recursive: true, force: true })
}

export interface TorrentRunnerDependencies {
	readonly downloads: DownloadsRepository
	readonly daemon: Pick<Aria2Daemon, 'ensureRunning' | 'call'>
	readonly store: Pick<TorrentStore, 'has' | 'load' | 'save'>
}

export interface TorrentRunnerOptions {
	readonly pollIntervalMs: number
	readonly metadataTimeoutMs: number
}

/**
 * Runs one queued torrent to completion through aria2.
 *
 * Magnet links first fetch their metadata (status `probing`). Once the name
 * and size are known the download adopts the real name and moves to
 * `downloading`. Progress is saved on every poll. On completion aria2 is
 * released, and the single top-level file or folder is renamed from the
 * staging folder to the destination without overwriting anything.
 *
 * Pausing, cancelling and shutting down all abort the signal. The torrent is
 * then removed from aria2, which keeps its control file in the staging folder,
 * so a later run resumes from the pieces already verified.
 */
export class TorrentRunner implements DownloadRunner {
	constructor(private readonly deps: TorrentRunnerDependencies, private readonly options: TorrentRunnerOptions) { }

	async run(id: string, signal: AbortSignal): Promise<RunOutcome> {
		const initial = this.deps.downloads.require(id)
		if (initial.status !== 'queued') return { kind: 'failed', code: 'invalid_state', message: `Only queued downloads can be started (status: ${initial.status})` }
		try {
			return await this.attempt(id, signal)
		} catch (error) {
			if (signal.aborted) return { kind: 'aborted' }
			return this.fail(id, error)
		}
	}

	private async attempt(id: string, signal: AbortSignal): Promise<RunOutcome> {
		const { downloads, daemon } = this.deps
		const initial = downloads.require(id)
		const metadata = parseMagnet(initial.url)
		const stage = stagingDirectory(initial.destination, id)
		downloads.setStatus(id, 'probing', { errorCode: null, errorMessage: null, speedBytesPerSecond: 0, etaSeconds: null })
		await mkdir(stage, { recursive: true })
		await daemon.ensureRunning()
		let gid = await this.start(initial.url, metadata.infoHash, stage)
		const gids = new Set<string>([gid])
		const startedAt = Date.now()
		let record = initial
		let adopted = false
		try {
			for (; ;) {
				if (signal.aborted) return { kind: 'aborted' }
				const status = parseStatus(await daemon.call('tellStatus', [gid, STATUS_KEYS]))
				if (status.followedBy !== null) {
					gid = status.followedBy
					gids.add(gid)
					continue
				}
				if (status.state === 'error') throw describeStatusError(status)
				if (status.state === 'removed') throw new TorrentFailure('torrent_removed', 'The torrent was removed from the engine')
				if (!adopted && status.name !== null && status.totalBytes > 0) {
					record = await this.adopt(record, status)
					adopted = true
					await this.keepMetadata(stage, metadata.infoHash)
				} else if (!adopted && Date.now() - startedAt > this.options.metadataTimeoutMs) {
					throw new TorrentFailure('torrent_metadata_timeout', 'No peers sent the torrent details in time. Check the magnet link or try again later')
				}
				if (adopted) {
					this.saveProgress(id, status)
					if (isComplete(status)) {
						await this.release(gids)
						return await this.finish(id, record, status, stage, metadata.infoHash)
					}
				}
				await pause(this.options.pollIntervalMs, signal)
			}
		} finally {
			await this.keepMetadata(stage, metadata.infoHash)
			await this.release(gids)
		}
	}

	private async start(link: string, infoHash: string, stage: string): Promise<string> {
		const options = { dir: stage }
		const file = await this.deps.store.load(infoHash)
		const result = file === null
			? await this.deps.daemon.call('addUri', [[link], options])
			: await this.deps.daemon.call('addTorrent', [Buffer.from(file).toString('base64'), [], options])
		const gid = asText(result)
		if (gid === null) throw new Aria2Error('The torrent engine did not accept the torrent')
		return gid
	}

	private async adopt(record: DownloadRecord, status: Aria2Status): Promise<DownloadRecord> {
		const name = sanitizeFilename(status.name ?? record.filename)
		let current = record
		if (name !== record.filename) {
			current = await withDestinationLock(async () => {
				const destination = await allocateDestination(dirname(record.destination), name, this.reserved(record.id))
				return this.deps.downloads.update(record.id, { filename: basename(destination), destination })
			})
		}
		return this.deps.downloads.setStatus(current.id, 'downloading', { totalBytes: status.totalBytes, downloadedBytes: Math.min(status.completedBytes, status.totalBytes) })
	}

	private saveProgress(id: string, status: Aria2Status): void {
		const remaining = Math.max(0, status.totalBytes - status.completedBytes)
		this.deps.downloads.saveProgress([{
			id,
			downloadedBytes: Math.min(status.completedBytes, status.totalBytes),
			speedBytesPerSecond: status.speed,
			etaSeconds: status.speed > 0 ? Math.ceil(remaining / status.speed) : null
		}])
	}

	private async keepMetadata(stage: string, infoHash: string): Promise<void> {
		try {
			if (await this.deps.store.has(infoHash)) return
			const file = Bun.file(join(stage, `${infoHash}.torrent`))
			if (await file.exists()) await this.deps.store.save(infoHash, new Uint8Array(await file.arrayBuffer()))
		} catch (error) {
			console.error('[wayfarer] could not keep the torrent metadata', error)
		}
	}

	private async release(gids: ReadonlySet<string>): Promise<void> {
		for (const gid of gids) {
			for (const method of ['forceRemove', 'removeDownloadResult']) {
				try {
					await this.deps.daemon.call(method, [gid])
				} catch {
					continue
				}
			}
		}
	}

	private async finish(id: string, record: DownloadRecord, status: Aria2Status, stage: string, infoHash: string): Promise<RunOutcome> {
		const entries = (await readdir(stage)).filter((entry) => !entry.endsWith('.aria2') && entry !== `${infoHash}.torrent`)
		const [entry] = entries
		if (entries.length !== 1 || entry === undefined) throw new TorrentFailure('torrent_unexpected_output', 'The finished torrent did not contain the expected files')
		const destination = await this.place(record, join(stage, entry))
		await rm(stage, { recursive: true, force: true })
		this.deps.downloads.setStatus(id, 'completed', { downloadedBytes: status.totalBytes, totalBytes: status.totalBytes, speedBytesPerSecond: 0, etaSeconds: 0, filename: basename(destination), destination })
		return { kind: 'completed' }
	}

	private async place(record: DownloadRecord, source: string): Promise<string> {
		let destination = record.destination
		if (await pathExists(destination)) {
			destination = await withDestinationLock(() => allocateDestination(dirname(record.destination), basename(record.destination), this.reserved(record.id)))
			this.deps.downloads.update(record.id, { filename: basename(destination), destination })
		}
		await moveWithRetry(source, destination)
		return destination
	}

	private reserved(excludeId: string): string[] {
		return this.deps.downloads.list().filter((other) => other.id !== excludeId).map((other) => other.destination)
	}

	private fail(id: string, error: unknown): RunOutcome {
		let failure: { code: string; message: string }
		if (error instanceof TorrentFailure) failure = { code: error.code, message: error.message }
		else if (error instanceof Aria2Error) failure = { code: 'torrent_engine', message: error.message }
		else if (error instanceof InvalidDownloadError) failure = { code: 'invalid_torrent', message: error.message }
		else {
			console.error('[wayfarer] unexpected torrent error', error)
			failure = { code: 'torrent_failed', message: 'The torrent failed unexpectedly' }
		}
		const current = this.deps.downloads.require(id)
		if (isActiveStatus(current.status)) this.deps.downloads.setStatus(id, 'failed', { errorCode: failure.code, errorMessage: failure.message, speedBytesPerSecond: 0, etaSeconds: null })
		return { kind: 'failed', code: failure.code, message: failure.message }
	}
}
