import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntime } from '../../src/app/runtime'
import type { Runtime } from '../../src/app/runtime'
import { loadConfig } from '../../src/config/config'
import { createHttpApp } from '../../src/http/app'
import { startServer } from '../../src/server/server'
import type { RunningServer } from '../../src/server/server'
import { sha256Hex } from '../helpers/harness'
import { makeBody, startOrigin } from '../helpers/origin'
import type { TestOrigin } from '../helpers/origin'
import { waitFor } from '../helpers/wait'

const TOKEN = 'secret-token-0123456789'
const BODY = makeBody(5000)
const JSON_HEADERS = { 'content-type': 'application/json' }

let directory = ''
let origin: TestOrigin
let runtime: Runtime
let server: RunningServer
let app: ReturnType<typeof createHttpApp>
let base = ''

async function start(extraEnv: Record<string, string> = {}): Promise<void> {
	const config = loadConfig({ WAYFARER_DATA_DIRECTORY: join(directory, 'data'), WAYFARER_ALLOW_PRIVATE_NETWORKS: '127.0.0.1', WAYFARER_RETRY_BASE_DELAY_MS: '1', WAYFARER_RETRY_MAX_DELAY_MS: '5', ...extraEnv })
	runtime = await createRuntime(config)
	await runtime.start()
	app = createHttpApp(runtime)
	server = startServer(app, { hostname: '127.0.0.1', port: 0 })
	base = server.url.href.replace(/\/$/, '')
}

function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
	return fetch(`${base}${path}`, { method, headers: { ...(body === undefined ? {} : JSON_HEADERS), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

async function addDownload(): Promise<string> {
	const response = await send('POST', '/api/downloads', { url: `${origin.url}/file` })
	expect(response.status).toBe(201)
	const payload = await response.json()
	return payload.data.id
}

async function addCompleted(): Promise<string> {
	const id = await addDownload()
	await waitFor(() => runtime.downloads.require(id).status === 'completed')
	return id
}

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'wayfarer-api-'))
	origin = startOrigin({ body: BODY })
})

afterEach(async () => {
	await server.stop()
	await runtime.shutdown()
	await origin.stop()
	await rm(directory, { recursive: true, force: true })
})

describe('API basics', () => {
	test('reports health and sets security headers', async () => {
		await start()
		const response = await send('GET', '/api/health')
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ data: { status: 'ok' } })
		expect(response.headers.get('x-content-type-options')).toBe('nosniff')
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(response.headers.get('x-frame-options')).toBe('DENY')
	})

	test('adds, lists and describes downloads without exposing server paths', async () => {
		await start()
		const created = await send('POST', '/api/downloads', { url: `${origin.url}/file`, priority: 3 })
		expect(created.status).toBe(201)
		const payload = await created.json()
		const id: string = payload.data.id
		expect(created.headers.get('location')).toBe(`/api/downloads/${id}`)
		expect(payload.data.priority).toBe(3)
		await waitFor(() => runtime.downloads.require(id).status === 'completed')
		const list = await (await send('GET', '/api/downloads')).json()
		expect(list.data).toHaveLength(1)
		const detail = await (await send('GET', `/api/downloads/${id}`)).json()
		expect(detail.data.status).toBe('completed')
		expect(detail.data.progress).toBe(1)
		expect(detail.data.checksum).toEqual({ state: 'not-requested' })
		expect(detail.data.segments.length).toBeGreaterThan(0)
		const text = JSON.stringify([list, detail])
		expect(text).not.toContain(runtime.config.downloadDirectory)
		expect(Object.keys(detail.data)).not.toContain('destination')
		expect(Object.keys(detail.data)).not.toContain('resolvedUrl')
		const filtered = await (await send('GET', '/api/downloads?status=failed')).json()
		expect(filtered.data).toEqual([])
		expect((await send('GET', '/api/downloads?status=bogus')).status).toBe(400)
	})

	test('validates input and reports errors consistently', async () => {
		await start()
		const badUrl = await send('POST', '/api/downloads', { url: 'ftp://example.test/x' })
		expect(badUrl.status).toBe(400)
		expect(await badUrl.json()).toEqual({ error: { code: 'invalid_request', message: 'Only http and https URLs are supported' } })
		expect((await send('POST', '/api/downloads', { priority: 1 })).status).toBe(400)
		expect((await send('POST', '/api/downloads', { url: `${origin.url}/file`, priority: 'high' })).status).toBe(400)
		const notJson = await fetch(`${base}/api/downloads`, { method: 'POST', headers: JSON_HEADERS, body: '{oops' })
		expect(notJson.status).toBe(400)
		expect((await notJson.json()).error.code).toBe('invalid_json')
		const wrongType = await fetch(`${base}/api/downloads`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
		expect(wrongType.status).toBe(415)
		const tooBig = await send('POST', '/api/downloads', { url: `${origin.url}/${'a'.repeat(70_000)}` })
		expect(tooBig.status).toBe(413)
		const missing = await send('GET', '/api/downloads/does-not-exist')
		expect(missing.status).toBe(404)
		expect(await missing.json()).toEqual({ error: { code: 'not_found', message: 'Download not found' } })
		expect((await send('GET', '/api/unknown')).status).toBe(404)
	})
})

describe('lifecycle endpoints', () => {
	test('pauses, resumes and cancels', async () => {
		origin.state.body = makeBody(4 * 1024 * 1024 + 123)
		origin.state.slow = { chunkBytes: 64 * 1024, delayMs: 25 }
		await start()
		const id = await addDownload()
		await waitFor(() => runtime.downloads.require(id).downloadedBytes > 100_000)
		const paused = await (await send('POST', `/api/downloads/${id}/pause`)).json()
		expect(paused.data.status).toBe('paused')
		const resumed = await (await send('POST', `/api/downloads/${id}/resume`)).json()
		expect(resumed.data.status).toBe('queued')
		await waitFor(() => runtime.downloads.require(id).status === 'downloading')
		const cancelled = await (await send('POST', `/api/downloads/${id}/cancel`)).json()
		expect(cancelled.data.status).toBe('cancelled')
		const again = await send('POST', `/api/downloads/${id}/pause`)
		expect(again.status).toBe(409)
		expect((await again.json()).error.code).toBe('invalid_state')
	})

	test('cannot cancel a completed download', async () => {
		await start()
		const id = await addCompleted()
		const response = await send('POST', `/api/downloads/${id}/cancel`)
		expect(response.status).toBe(409)
	})

	test('deletes records, optionally with the file', async () => {
		await start()
		const kept = await addCompleted()
		const keptPath = runtime.downloads.require(kept).destination
		expect((await send('DELETE', `/api/downloads/${kept}`)).status).toBe(200)
		expect(await Bun.file(keptPath).exists()).toBe(true)
		expect((await send('GET', `/api/downloads/${kept}`)).status).toBe(404)
		const removed = await addCompleted()
		const removedPath = runtime.downloads.require(removed).destination
		expect((await send('DELETE', `/api/downloads/${removed}?deleteFile=true`)).status).toBe(200)
		expect(await Bun.file(removedPath).exists()).toBe(false)
		expect((await send('DELETE', `/api/downloads/${removed}`)).status).toBe(404)
	})

	test('changes and persists the bandwidth limit', async () => {
		await start()
		expect((await (await send('GET', '/api/settings/bandwidth')).json()).data.bytesPerSecond).toBe(0)
		const changed = await send('PATCH', '/api/settings/bandwidth', { bytesPerSecond: 2_000_000 })
		expect(changed.status).toBe(200)
		expect(runtime.limiter.bytesPerSecond).toBe(2_000_000)
		expect(runtime.settings.getBandwidthLimit()).toBe(2_000_000)
		expect((await send('PATCH', '/api/settings/bandwidth', { bytesPerSecond: -1 })).status).toBe(400)
		expect((await send('PATCH', '/api/settings/bandwidth', { bytesPerSecond: 'fast' })).status).toBe(400)
	})
})

describe('file streaming', () => {
	test('serves the file, byte ranges and unsatisfiable ranges', async () => {
		await start()
		const id = await addCompleted()
		const full = await send('GET', `/api/downloads/${id}/file`)
		expect(full.status).toBe(200)
		expect(full.headers.get('accept-ranges')).toBe('bytes')
		expect(full.headers.get('content-disposition')).toContain('attachment')
		expect(full.headers.get('content-security-policy')).toBe('sandbox')
		expect(sha256Hex(new Uint8Array(await full.arrayBuffer()))).toBe(sha256Hex(BODY))
		const middle = await send('GET', `/api/downloads/${id}/file`, undefined, { range: 'bytes=10-19' })
		expect(middle.status).toBe(206)
		expect(middle.headers.get('content-range')).toBe('bytes 10-19/5000')
		expect(new Uint8Array(await middle.arrayBuffer())).toEqual(BODY.slice(10, 20))
		const suffix = await send('GET', `/api/downloads/${id}/file`, undefined, { range: 'bytes=-5' })
		expect(suffix.status).toBe(206)
		expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(BODY.slice(4995))
		const beyond = await send('GET', `/api/downloads/${id}/file`, undefined, { range: 'bytes=9999-' })
		expect(beyond.status).toBe(416)
		expect(beyond.headers.get('content-range')).toBe('bytes */5000')
	})

	test('refuses unfinished and unknown downloads', async () => {
		origin.state.failures = { status: 404, remaining: 1000 }
		await start()
		const id = await addDownload()
		await waitFor(() => runtime.downloads.require(id).status === 'failed')
		expect((await send('GET', `/api/downloads/${id}/file`)).status).toBe(409)
		expect((await send('GET', '/api/downloads/nope/file')).status).toBe(404)
	})
})

describe('authentication and request guards', () => {
	test('requires the bearer token when one is configured', async () => {
		await start({ WAYFARER_AUTH_TOKEN: TOKEN })
		const anonymous = await send('GET', '/api/downloads')
		expect(anonymous.status).toBe(401)
		expect(anonymous.headers.get('www-authenticate')).toBe('Bearer')
		expect((await send('GET', '/api/downloads', undefined, { authorization: 'Bearer wrong-token-0123456789' })).status).toBe(401)
		expect((await send('GET', '/api/downloads', undefined, { authorization: `Basic ${TOKEN}` })).status).toBe(401)
		expect((await send('GET', '/api/downloads', undefined, { authorization: `Bearer ${TOKEN}` })).status).toBe(200)
		expect((await send('GET', '/api/health')).status).toBe(200)
	})

	test('rejects unexpected Host headers', async () => {
		await start()
		const response = await app.fetch(new Request(`${base}/api/health`, { headers: { host: 'evil.example' } }))
		expect(response.status).toBe(421)
	})

	test('rejects cross-origin state changes before they reach any handler', async () => {
		await start()
		const host = new URL(base).host
		const attempt = (origin: string | null, extra: Record<string, string> = {}) => app.fetch(new Request(`${base}/api/downloads/unknown/pause`, { method: 'POST', headers: { host, ...(origin === null ? {} : { origin }), ...extra } }))
		expect((await attempt('http://evil.example')).status).toBe(403)
		expect((await attempt(null, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
		expect((await attempt('null')).status).toBe(403)
		expect((await attempt(`http://${host}`)).status).toBe(404)
		expect((await attempt(null)).status).toBe(404)
	})
})
