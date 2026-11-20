import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TorrentRunner } from '../../src/downloads/torrent/runner'
import { TorrentStore } from '../../src/downloads/torrent/store'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'

const HASH = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a'

type Status = Readonly<Record<string, unknown>>

class FakeDaemon {
	readonly calls: string[] = []
	private cursor = 0

	constructor(private readonly timeline: readonly Status[], private readonly onAdd: (directory: string) => Promise<void> = async () => undefined) { }

	async ensureRunning(): Promise<void> {
		return undefined
	}

	async call(method: string, params: readonly unknown[] = []): Promise<unknown> {
		this.calls.push(method)
		if (method === 'addUri' || method === 'addTorrent') {
			const options = params[params.length - 1]
			const directory = typeof options === 'object' && options !== null && 'dir' in options && typeof options.dir === 'string' ? options.dir : ''
			await this.onAdd(directory)
			return 'gid1'
		}
		if (method === 'tellStatus') {
			const status = this.timeline[Math.min(this.cursor, this.timeline.length - 1)] ?? {}
			this.cursor += 1
			return status
		}
		return 'OK'
	}
}

let context: TestContext
let downloads: string
let store: TorrentStore

beforeEach(async () => {
	context = await createTestContext()
	downloads = join(context.directory, 'downloads')
	await mkdir(downloads, { recursive: true })
	store = new TorrentStore(join(context.directory, 'torrents'))
})

afterEach(async () => {
	await context.dispose()
})

function queue(): string {
	const created = context.downloads.create({ url: `magnet:?xt=urn:btih:${HASH}`, filename: HASH, destination: join(downloads, HASH) })
	return context.downloads.update(created.id, { resolver: 'torrent' }).id
}

function runner(daemon: FakeDaemon, metadataTimeoutMs = 60_000): TorrentRunner {
	return new TorrentRunner({ downloads: context.downloads, daemon, store }, { pollIntervalMs: 5, metadataTimeoutMs })
}

const followed: Status = { status: 'complete', totalLength: '0', completedLength: '0', followedBy: ['gid2'], bittorrent: {} }
const running: Status = { status: 'active', totalLength: '1000', completedLength: '400', downloadSpeed: '100', bittorrent: { info: { name: 'movie.mkv' } } }
const finished: Status = { status: 'complete', totalLength: '1000', completedLength: '1000', downloadSpeed: '0', bittorrent: { info: { name: 'movie.mkv' } } }

describe('TorrentRunner', () => {
	test('follows a magnet link to completion and moves the file into place', async () => {
		const daemon = new FakeDaemon([followed, running, finished], async (directory) => { await writeFile(join(directory, 'movie.mkv'), 'x'.repeat(1000)) })
		const id = queue()
		expect(await runner(daemon).run(id, new AbortController().signal)).toEqual({ kind: 'completed' })
		const record = context.downloads.require(id)
		expect(record.status).toBe('completed')
		expect(record.filename).toBe('movie.mkv')
		expect(record.totalBytes).toBe(1000)
		expect((await stat(record.destination)).size).toBe(1000)
		expect(await readdir(downloads)).toEqual(['movie.mkv'])
		expect(daemon.calls).toContain('forceRemove')
	})

	test('moves a multi-file torrent as a folder', async () => {
		const status = { ...finished, bittorrent: { info: { name: 'Show' } } }
		const daemon = new FakeDaemon([followed, status], async (directory) => {
			await mkdir(join(directory, 'Show'), { recursive: true })
			await writeFile(join(directory, 'Show', 'ep1.txt'), 'one')
		})
		const id = queue()
		expect((await runner(daemon).run(id, new AbortController().signal)).kind).toBe('completed')
		expect(existsSync(join(downloads, 'Show', 'ep1.txt'))).toBe(true)
	})

	test('records the failure the engine reports', async () => {
		const daemon = new FakeDaemon([{ status: 'error', errorCode: '9', errorMessage: 'disk full', totalLength: '0' }])
		const id = queue()
		const outcome = await runner(daemon).run(id, new AbortController().signal)
		expect(outcome).toMatchObject({ kind: 'failed', code: 'torrent_error_9' })
		const record = context.downloads.require(id)
		expect(record.status).toBe('failed')
		expect(record.errorMessage).toContain('disk space')
	})

	test('fails when no peer sends the metadata in time', async () => {
		const daemon = new FakeDaemon([{ status: 'active', totalLength: '0', completedLength: '0' }])
		const id = queue()
		const outcome = await runner(daemon, -1).run(id, new AbortController().signal)
		expect(outcome).toMatchObject({ kind: 'failed', code: 'torrent_metadata_timeout' })
	})

	test('releases the torrent and reports an abort', async () => {
		const daemon = new FakeDaemon([followed, running])
		const id = queue()
		const controller = new AbortController()
		setTimeout(() => controller.abort(), 40)
		expect(await runner(daemon).run(id, controller.signal)).toEqual({ kind: 'aborted' })
		expect(daemon.calls).toContain('forceRemove')
		expect(context.downloads.require(id).status).toBe('downloading')
	})

	test('refuses to start a download that is not queued', async () => {
		const id = queue()
		context.downloads.setStatus(id, 'paused')
		expect(await runner(new FakeDaemon([finished])).run(id, new AbortController().signal)).toMatchObject({ kind: 'failed', code: 'invalid_state' })
	})
})
