import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Aria2Daemon, Aria2Error, asRecord, asText } from '../../src/downloads/torrent/aria2'

async function withDirectory<T>(work: (directory: string) => Promise<T>): Promise<T> {
	const directory = await mkdtemp(join(tmpdir(), 'wayfarer-aria2-'))
	try {
		return await work(directory)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

function daemonFor(binary: string, directory: string): Aria2Daemon {
	return new Aria2Daemon({ binary, directory, maxPeers: 10, trackers: [], listenPort: null, maxConcurrentDownloads: 1, downloadLimitBytesPerSecond: 0 })
}

describe('Aria2Daemon', () => {
	test('explains how to fix a missing aria2c', async () => {
		await withDirectory(async (directory) => {
			const error = await daemonFor('wayfarer-no-such-aria2', directory).ensureRunning().catch((failure: unknown) => failure)
			expect(error).toBeInstanceOf(Aria2Error)
			expect(error instanceof Error ? error.message : '').toContain('WAYFARER_ARIA2_PATH')
		})
	})

	test.skipIf(Bun.which('aria2c') === null)('starts, answers RPC calls and stops', async () => {
		await withDirectory(async (directory) => {
			const daemon = daemonFor('aria2c', directory)
			try {
				await daemon.ensureRunning()
				expect(asText(asRecord(await daemon.call('getVersion'))?.['version'])).not.toBeNull()
			} finally {
				await daemon.stop()
			}
		})
	}, 30_000)
})
