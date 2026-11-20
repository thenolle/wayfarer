import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { RunOutcome } from '../../src/downloads/engine/engine'
import { RoutingRunner } from '../../src/downloads/routing-runner'
import { createTestContext } from '../helpers/fixtures'
import type { TestContext } from '../helpers/fixtures'

let context: TestContext

beforeEach(async () => {
	context = await createTestContext()
})

afterEach(async () => {
	await context.dispose()
})

function fake(name: string, calls: string[]): { run(id: string, signal: AbortSignal): Promise<RunOutcome> } {
	return { run: async () => { calls.push(name); return { kind: 'completed' } } }
}

describe('RoutingRunner', () => {
	test('sends magnet records to the torrent runner and the rest to the HTTP engine', async () => {
		const calls: string[] = []
		const runner = new RoutingRunner(context.downloads, fake('http', calls), fake('torrent', calls))
		const torrent = context.downloads.create({ url: 'magnet:?xt=urn:btih:abc', filename: 'a', destination: join(context.directory, 'a') })
		const http = context.downloads.create({ url: 'https://example.test/b.zip', filename: 'b.zip', destination: join(context.directory, 'b.zip') })
		await runner.run(torrent.id, new AbortController().signal)
		await runner.run(http.id, new AbortController().signal)
		expect(calls).toEqual(['torrent', 'http'])
	})

	test('leaves unknown ids to the HTTP engine', async () => {
		const calls: string[] = []
		await new RoutingRunner(context.downloads, fake('http', calls), fake('torrent', calls)).run('missing', new AbortController().signal)
		expect(calls).toEqual(['http'])
	})
})
