import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import type { DownloadRecord } from '../../src/downloads/domain/records'
import { BlockedDestinationError } from '../../src/downloads/http/errors'
import { buildPayload, signBody, WebhookNotifier } from '../../src/downloads/webhook'

const SECRET = 'secret-secret-secret'
const NOW = 1_700_000_000_000

const record = (overrides: Partial<DownloadRecord> = {}): DownloadRecord => ({
	id: 'id-1',
	url: 'https://files.example.test/a.zip?token=secret-token',
	resolver: 'direct',
	resolvedUrl: null,
	resolvedMetadata: null,
	filename: 'a.zip',
	destination: '/srv/downloads/a.zip',
	status: 'completed',
	priority: 0,
	totalBytes: 100,
	downloadedBytes: 100,
	speedBytesPerSecond: 0,
	etaSeconds: null,
	etag: null,
	lastModified: null,
	expectedSha256: null,
	actualSha256: 'ab'.repeat(32),
	errorCode: null,
	errorMessage: null,
	retryCount: 0,
	createdAt: 1,
	updatedAt: 2,
	completedAt: 3,
	...overrides
})

function setup(responses: (Response | Error)[] = [], options: { secret?: string | null; policy?: { assertAllowed(url: URL): Promise<void> } } = {}) {
	const calls: { url: string; init: RequestInit }[] = []
	const logs: string[] = []
	const notifier = new WebhookNotifier(
		{ url: new URL('https://hooks.example.test/in?key=hook-key'), secret: options.secret === undefined ? SECRET : options.secret },
		{
			policy: options.policy ?? { assertAllowed: async () => undefined },
			fetchImpl: async (input, init) => {
				calls.push({ url: input, init })
				const next = responses.shift() ?? new Response(null, { status: 200 })
				if (next instanceof Error) throw next
				return next
			},
			retryDelaysMs: [1, 1],
			sleep: async () => undefined,
			now: () => NOW,
			log: (message) => { logs.push(message) }
		}
	)
	return { notifier, calls, logs }
}

const headersOf = (call: { init: RequestInit } | undefined): Record<string, string> => (call?.init.headers ?? {}) as Record<string, string>

describe('buildPayload', () => {
	test('describes the download without links, paths or secrets', () => {
		const payload = buildPayload('download.completed', record(), NOW)
		expect(payload).toEqual({
			event: 'download.completed',
			timestamp: '2023-11-14T22:13:20.000Z',
			download: { id: 'id-1', filename: 'a.zip', host: 'files.example.test', resolver: 'direct', totalBytes: 100, downloadedBytes: 100, sha256: 'ab'.repeat(32), error: null }
		})
		const text = JSON.stringify(payload)
		expect(text).not.toContain('secret-token')
		expect(text).not.toContain('/srv/downloads')
	})

	test('carries the error of a failed download', () => {
		const payload = buildPayload('download.failed', record({ status: 'failed', actualSha256: null, errorCode: 'http_503', errorMessage: 'unavailable' }), NOW)
		expect(payload.download.error).toEqual({ code: 'http_503', message: 'unavailable' })
		expect(payload.download.sha256).toBeNull()
	})
})

describe('WebhookNotifier', () => {
	test('signs the timestamp and body with HMAC-SHA256', async () => {
		const { notifier, calls } = setup()
		notifier.notify(record())
		await notifier.drain()
		expect(calls).toHaveLength(1)
		const body = String(calls[0]?.init.body)
		const expected = createHmac('sha256', SECRET).update(`1700000000.${body}`).digest('hex')
		const headers = headersOf(calls[0])
		expect(headers['x-wayfarer-signature']).toBe(`sha256=${expected}`)
		expect(headers['x-wayfarer-timestamp']).toBe('1700000000')
		expect(headers['x-wayfarer-event']).toBe('download.completed')
		expect(headers['content-type']).toBe('application/json')
		expect(calls[0]?.init.method).toBe('POST')
		expect(calls[0]?.init.redirect).toBe('manual')
		expect(signBody(SECRET, 1_700_000_000, body)).toBe(expected)
	})

	test('sends no signature without a secret', async () => {
		const { notifier, calls } = setup([], { secret: null })
		notifier.notify(record())
		await notifier.drain()
		expect(headersOf(calls[0])['x-wayfarer-signature']).toBeUndefined()
	})

	test('only reports completed and failed downloads', async () => {
		const { notifier, calls } = setup()
		for (const status of ['queued', 'downloading', 'paused', 'cancelled'] as const) notifier.notify(record({ status }))
		notifier.notify(record({ status: 'failed' }))
		await notifier.drain()
		expect(calls).toHaveLength(1)
		expect(headersOf(calls[0])['x-wayfarer-event']).toBe('download.failed')
	})

	test('retries transient failures with the same delivery id', async () => {
		const { notifier, calls, logs } = setup([new Response(null, { status: 503 }), new Error('boom'), new Response(null, { status: 200 })])
		notifier.notify(record())
		await notifier.drain()
		expect(calls).toHaveLength(3)
		expect(new Set(calls.map((call) => headersOf(call)['x-wayfarer-delivery'])).size).toBe(1)
		expect(logs).toEqual([])
	})

	test('gives up after the retries and logs once, without the URL', async () => {
		const { notifier, calls, logs } = setup([new Response(null, { status: 503 }), new Response(null, { status: 503 }), new Response(null, { status: 503 })])
		notifier.notify(record())
		await notifier.drain()
		expect(calls).toHaveLength(3)
		expect(logs).toHaveLength(1)
		expect(logs[0]).toContain('HTTP 503')
		expect(logs[0]).not.toContain('hook-key')
		expect(logs[0]).not.toContain('hooks.example.test')
	})

	test('does not retry client errors or follow redirects', async () => {
		const client = setup([new Response(null, { status: 400 })])
		client.notifier.notify(record())
		await client.notifier.drain()
		expect(client.calls).toHaveLength(1)
		expect(client.logs[0]).toContain('HTTP 400')
		const redirect = setup([new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.test/' } })])
		redirect.notifier.notify(record())
		await redirect.notifier.drain()
		expect(redirect.calls).toHaveLength(1)
		expect(redirect.logs[0]).toContain('redirects are not followed')
	})

	test('never contacts a destination the network policy refuses', async () => {
		const { notifier, calls, logs } = setup([], { policy: { assertAllowed: async () => { throw new BlockedDestinationError('The destination address is not allowed') } } })
		notifier.notify(record())
		await notifier.drain()
		expect(calls).toHaveLength(0)
		expect(logs).toHaveLength(1)
		expect(logs[0]).toContain('not allowed')
	})

	test('drain waits for deliveries in progress', async () => {
		let finished = false
		const notifier = new WebhookNotifier(
			{ url: new URL('https://hooks.example.test/in'), secret: null },
			{ policy: { assertAllowed: async () => undefined }, fetchImpl: async () => { await Bun.sleep(20); finished = true; return new Response(null, { status: 200 }) } }
		)
		notifier.notify(record())
		expect(finished).toBe(false)
		await notifier.drain()
		expect(finished).toBe(true)
	})
})
