import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntime } from '../../src/app/runtime'
import { loadConfig } from '../../src/config/config'
import { closeDatabase, openDatabase } from '../../src/database/connection'
import { DownloadsRepository } from '../../src/database/downloads-repository'
import { ShuttingDownError } from '../../src/downloads/intake'
import { hashFile } from '../../src/downloads/verification/sha256'
import { fileSize } from '../../src/filesystem/stat'
import { sha256Hex } from '../helpers/harness'
import { makeBody, startOrigin } from '../helpers/origin'
import type { TestOrigin } from '../helpers/origin'
import { waitFor } from '../helpers/wait'

let directory = ''
let origin: TestOrigin

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'wayfarer-runtime-'))
	origin = startOrigin({ body: makeBody(5000) })
})

afterEach(async () => {
	await origin.stop()
	await rm(directory, { recursive: true, force: true })
})

function configuration() {
	return loadConfig({ WAYFARER_DATA_DIRECTORY: join(directory, 'data'), WAYFARER_ALLOW_PRIVATE_NETWORKS: '127.0.0.1', WAYFARER_RETRY_BASE_DELAY_MS: '1', WAYFARER_RETRY_MAX_DELAY_MS: '5' })
}

describe('runtime', () => {
	test('downloads, shuts down cleanly and keeps its data across restarts', async () => {
		const config = configuration()
		const first = await createRuntime(config)
		await first.start()
		const added = await first.intake.add({ url: `${origin.url}/file` })
		await waitFor(() => first.downloads.require(added.id).status === 'completed')
		await first.shutdown()
		expect((await fileSize(`${config.databasePath}-wal`)) ?? 0).toBe(0)
		expect(await hashFile(added.destination)).toBe(sha256Hex(makeBody(5000)))
		const second = await createRuntime(config)
		expect(second.downloads.list().map((download) => download.status)).toEqual(['completed'])
		await second.shutdown()
	})

	test('refuses new downloads after shutdown and shuts down only once', async () => {
		const runtime = await createRuntime(configuration())
		await runtime.start()
		const stopping = runtime.shutdown()
		expect(runtime.shutdown()).toBe(stopping)
		await stopping
		expect(runtime.intake.add({ url: `${origin.url}/file` })).rejects.toBeInstanceOf(ShuttingDownError)
	})

	test('persists the bandwidth limit', async () => {
		const config = configuration()
		const first = await createRuntime(config)
		first.setBandwidthLimit(2048)
		expect(() => first.setBandwidthLimit(-5)).toThrow(RangeError)
		await first.shutdown()
		const second = await createRuntime(config)
		expect(second.limiter.bytesPerSecond).toBe(2048)
		await second.shutdown()
	})

	test('recovers an interrupted download on start and finishes it', async () => {
		const config = configuration()
		const database = openDatabase(config.databasePath)
		const seeded = new DownloadsRepository(database)
		const record = seeded.create({ url: `${origin.url}/file`, filename: 'seed.bin', destination: join(config.downloadDirectory, 'seed.bin') })
		seeded.setStatus(record.id, 'probing')
		seeded.setStatus(record.id, 'downloading')
		closeDatabase(database)
		const runtime = await createRuntime(config)
		const report = await runtime.start()
		expect(report.restarted).toEqual([{ id: record.id, reason: 'unknown-size' }])
		await waitFor(() => runtime.downloads.require(record.id).status === 'completed')
		await runtime.shutdown()
	})
})
