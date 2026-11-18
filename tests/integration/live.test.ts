import { afterEach, describe, expect, test } from 'bun:test'
import { parseLiveMessage } from '../../src/shared/live-protocol'
import type { LiveMessage } from '../../src/shared/live-protocol'
import { makeBody } from '../helpers/origin'
import { startWeb } from '../helpers/web'
import type { WebFixture } from '../helpers/web'
import { waitFor } from '../helpers/wait'

const TOKEN = 'secret-token-0123456789'

let fixture: WebFixture | null = null
const sockets: WebSocket[] = []

afterEach(async () => {
	for (const socket of sockets.splice(0)) socket.close()
	await fixture?.stop()
	fixture = null
})

function open(base: string, headers: Record<string, string>): Promise<{ socket: WebSocket; messages: LiveMessage[] }> {
	const messages: LiveMessage[] = []
	const BunWebSocket = WebSocket as unknown as new (url: string, options: { headers: Record<string, string> }) => WebSocket
	const socket = new BunWebSocket(`${base.replace('http:', 'ws:')}/ws`, { headers })
	sockets.push(socket)
	socket.addEventListener('message', (event) => {
		const message = parseLiveMessage(String(event.data))
		if (message !== null) messages.push(message)
	})
	return new Promise((resolve, reject) => {
		socket.addEventListener('open', () => resolve({ socket, messages }))
		socket.addEventListener('error', () => reject(new Error('The connection was refused')))
		socket.addEventListener('close', () => reject(new Error('The connection was closed')))
	})
}

describe('live updates', () => {
	test('sends a snapshot, then progress for a running download', async () => {
		fixture = await startWeb({ origin: { body: makeBody(4 * 1024 * 1024 + 123), slow: { chunkBytes: 64 * 1024, delayMs: 25 } } })
		const { messages } = await open(fixture.base, { origin: fixture.base })
		await waitFor(() => messages.length > 0)
		expect(messages[0]?.type).toBe('snapshot')
		const added = await fixture.runtime.intake.add({ url: `${fixture.origin.url}/file` })
		await waitFor(() => messages.some((message) => message.type === 'update' && message.downloads.some((item) => item.id === added.id && item.downloadedBytes > 0 && item.segments.length > 1)))
		fixture.origin.state.slow = null
		await waitFor(() => messages.some((message) => message.type === 'update' && message.downloads.some((item) => item.id === added.id && item.status === 'completed')))
	})

	test('only reports downloads that changed', async () => {
		fixture = await startWeb()
		const first = await fixture.runtime.intake.add({ url: `${fixture.origin.url}/file` })
		await waitFor(() => fixture?.runtime.downloads.require(first.id).status === 'completed')
		const { messages } = await open(fixture.base, { origin: fixture.base })
		await waitFor(() => messages.length > 0)
		expect(messages[0]?.downloads.map((item) => item.id)).toContain(first.id)
		await Bun.sleep(250)
		expect(messages).toHaveLength(1)
	})

	test('refuses connections without a matching Origin, and connections from other sites', async () => {
		fixture = await startWeb()
		await open(fixture.base, {}).then(() => { throw new Error('Expected connection to be refused') }, () => undefined)
		await open(fixture.base, { origin: 'http://evil.example' }).then(() => { throw new Error('Expected connection to be refused') }, () => undefined)
	})

	test('requires authentication when a token is configured', async () => {
		const web = await startWeb({ env: { WAYFARER_AUTH_TOKEN: TOKEN } })
		fixture = web
		const probe = async (headers: Record<string, string>): Promise<number> => (await fetch(`${web.base}/ws`, { headers })).status
		expect(await probe({})).toBe(403)
		expect(await probe({ origin: web.base })).toBe(401)
		expect(await probe({ authorization: 'Bearer wrong-token-0123456789' })).toBe(403)
		expect(await probe({ authorization: `Bearer ${TOKEN}` })).toBe(426)
		const browser = web.newBrowser()
		await browser.post('/actions/login', { csrf: await browser.csrf('/login'), token: TOKEN })
		const cookie = browser.cookie
		if (cookie === null) throw new Error('no session')
		expect(await probe({ origin: web.base, cookie })).toBe(426)
		expect(await probe({ origin: 'http://evil.example', cookie })).toBe(403)
	})
})
