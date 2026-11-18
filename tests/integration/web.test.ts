import { afterEach, describe, expect, test } from 'bun:test'
import { hashFile } from '../../src/downloads/verification/sha256'
import { sha256Hex } from '../helpers/harness'
import { makeBody } from '../helpers/origin'
import { startWeb } from '../helpers/web'
import type { WebFixture } from '../helpers/web'
import { waitFor } from '../helpers/wait'

const TOKEN = 'secret-token-0123456789'
const SLOW = { chunkBytes: 64 * 1024, delayMs: 25 }

let fixture: WebFixture | null = null

afterEach(async () => {
	if (fixture !== null) {
		for (const record of fixture.runtime.downloads.list()) {
			await fixture.runtime.scheduler.remove(record.id, { deleteFile: true })
		}
		await fixture.stop()
	}
	fixture = null
})

async function start(options: Parameters<typeof startWeb>[0] = {}): Promise<WebFixture> {
	fixture = await startWeb(options)
	return fixture
}

describe('dashboard without JavaScript', () => {
	test('serves a complete HTML page with working forms and a session cookie', async () => {
		const web = await start()
		const response = await web.newBrowser().get('/')
		const html = await response.text()
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('text/html')
		expect(html).toContain('action="/actions/add"')
		expect(html).toContain('action="/actions/bandwidth"')
		expect(html).toContain('data-live-root')
		expect(response.headers.get('content-security-policy')).toContain("script-src 'self'")
		const cookie = response.headers.get('set-cookie') ?? ''
		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('SameSite=Strict')
	})

	test('adds a download with a plain form post, then lists and serves it', async () => {
		const web = await start()
		const browser = web.newBrowser()
		const csrf = await browser.csrf()
		const added = await browser.post('/actions/add', { csrf, url: `${web.origin.url}/file` })
		expect(added.status).toBe(303)
		expect(added.headers.get('location')).toBe('/')
		const page = await (await browser.get('/')).text()
		expect(page).toContain('Added')
		const record = web.runtime.downloads.list()[0]
		if (record === undefined) throw new Error('download missing')
		await waitFor(() => web.runtime.downloads.require(record.id).status === 'completed')
		const done = await (await browser.get('/')).text()
		expect(done).toContain('Completed')
		expect(done).toContain(`/files/${record.id}`)
		const file = await browser.get(`/files/${record.id}`)
		expect(file.status).toBe(200)
		expect(sha256Hex(new Uint8Array(await file.arrayBuffer()))).toBe(sha256Hex(makeBody(5000)))
	})

	test('shows validation errors from a form post', async () => {
		const web = await start()
		const browser = web.newBrowser()
		const csrf = await browser.csrf()
		await browser.post('/actions/add', { csrf, url: 'ftp://example.test/file' })
		const page = await (await browser.get('/')).text()
		expect(page).toContain('Only http and https URLs are supported')
		expect(web.runtime.downloads.list()).toHaveLength(0)
	})

	test('pauses, resumes, changes priority and removes through forms', async () => {
		const web = await start({ origin: { body: makeBody(4 * 1024 * 1024 + 123), slow: SLOW } })
		const browser = web.newBrowser()
		const csrf = await browser.csrf()
		await browser.post('/actions/add', { csrf, url: `${web.origin.url}/file` })
		const record = web.runtime.downloads.list()[0]
		if (record === undefined) throw new Error('download missing')
		const status = () => web.runtime.downloads.require(record.id).status
		await waitFor(() => web.runtime.downloads.require(record.id).downloadedBytes > 100_000)
		await browser.post(`/actions/downloads/${record.id}/pause`, { csrf })
		expect(status()).toBe('paused')
		await browser.post(`/actions/downloads/${record.id}/priority`, { csrf, priority: '9' })
		expect(web.runtime.downloads.require(record.id).priority).toBe(9)
		web.origin.state.slow = null
		await browser.post(`/actions/downloads/${record.id}/resume`, { csrf })
		await waitFor(() => status() === 'completed')
		await browser.post(`/actions/downloads/${record.id}/delete`, { csrf })
		expect(web.runtime.downloads.get(record.id)).toBeNull()
	})

	test('sets the bandwidth limit from the form', async () => {
		const web = await start()
		const browser = web.newBrowser()
		const csrf = await browser.csrf()
		await browser.post('/actions/bandwidth', { csrf, amount: '1.5', unit: 'mib' })
		expect(web.runtime.limiter.bytesPerSecond).toBe(1_572_864)
		expect(await (await browser.get('/')).text()).toContain('Limited to 1.50 MiB/s')
		await browser.post('/actions/bandwidth', { csrf, amount: '0', unit: 'kib' })
		expect(web.runtime.limiter.bytesPerSecond).toBe(0)
		await browser.post('/actions/bandwidth', { csrf, amount: '-3', unit: 'mib' })
		expect(web.runtime.limiter.bytesPerSecond).toBe(0)
		expect(await (await browser.get('/')).text()).toContain('Enter a speed of zero or more')
	})
})

describe('form protection', () => {
	test('rejects missing and wrong CSRF tokens', async () => {
		const web = await start()
		const browser = web.newBrowser()
		await browser.csrf()
		const missing = await browser.post('/actions/add', { url: `${web.origin.url}/file` })
		expect(missing.status).toBe(403)
		const wrong = await browser.post('/actions/add', { csrf: 'a'.repeat(64), url: `${web.origin.url}/file` })
		expect(wrong.status).toBe(403)
		const stranger = await web.newBrowser().post('/actions/add', { csrf: 'a'.repeat(64), url: `${web.origin.url}/file` })
		expect(stranger.status).toBe(403)
		expect(web.runtime.downloads.list()).toHaveLength(0)
	})

	test('rejects cross-origin posts even with a valid token', async () => {
		const web = await start()
		const browser = web.newBrowser()
		const csrf = await browser.csrf()
		const response = await browser.post('/actions/add', { csrf, url: `${web.origin.url}/file` }, { origin: 'http://evil.example' })
		expect(response.status).toBe(403)
		expect(web.runtime.downloads.list()).toHaveLength(0)
	})
})

describe('signing in', () => {
	test('sends visitors to the sign-in page and accepts the token', async () => {
		const web = await start({ env: { WAYFARER_AUTH_TOKEN: TOKEN } })
		const browser = web.newBrowser()
		const home = await browser.get('/')
		expect(home.status).toBe(303)
		expect(home.headers.get('location')).toBe('/login')
		const csrf = await browser.csrf('/login')
		const wrong = await browser.post('/actions/login', { csrf, token: 'wrong-token-0123456789' })
		expect(wrong.headers.get('location')).toBe('/login')
		expect(await (await browser.get('/login')).text()).toContain('not correct')
		const ok = await browser.post('/actions/login', { csrf: await browser.csrf('/login'), token: TOKEN })
		expect(ok.status).toBe(303)
		expect(ok.headers.get('location')).toBe('/')
		expect((await browser.get('/')).status).toBe(200)
	})

	test('does not accept session cookies on the API, and signing out ends the session', async () => {
		const web = await start({ env: { WAYFARER_AUTH_TOKEN: TOKEN } })
		const browser = web.newBrowser()
		await browser.post('/actions/login', { csrf: await browser.csrf('/login'), token: TOKEN })
		expect((await browser.get('/api/downloads')).status).toBe(401)
		const csrf = await browser.csrf('/')
		const out = await browser.post('/actions/logout', { csrf })
		expect(out.headers.get('location')).toBe('/login')
		expect((await browser.get('/')).status).toBe(303)
	})

	test('refuses files to visitors who are not signed in', async () => {
		const web = await start({ env: { WAYFARER_AUTH_TOKEN: TOKEN } })
		const response = await web.newBrowser().get('/files/anything')
		expect(response.status).toBe(303)
		expect(response.headers.get('location')).toBe('/login')
	})

	test('throttles repeated wrong tokens', async () => {
		const web = await start({ env: { WAYFARER_AUTH_TOKEN: TOKEN } })
		const browser = web.newBrowser()
		for (let attempt = 0; attempt < 5; attempt += 1) await browser.post('/actions/login', { csrf: await browser.csrf('/login'), token: `wrong-${attempt}-0123456789` })
		await browser.post('/actions/login', { csrf: await browser.csrf('/login'), token: TOKEN })
		expect(await (await browser.get('/login')).text()).toContain('Too many attempts')
	})
})

test('unknown pages get a 404 document', async () => {
	const web = await start()
	const response = await web.newBrowser().get('/definitely/not/here')
	expect(response.status).toBe(404)
	expect(response.headers.get('content-type')).toContain('text/html')
})

test('completed downloads on disk match what the server sent', async () => {
	const web = await start()
	const browser = web.newBrowser()
	await browser.post('/actions/add', { csrf: await browser.csrf(), url: `${web.origin.url}/file` })
	const record = web.runtime.downloads.list()[0]
	if (record === undefined) throw new Error('download missing')
	await waitFor(() => web.runtime.downloads.require(record.id).status === 'completed')
	expect(await hashFile(web.runtime.downloads.require(record.id).destination)).toBe(sha256Hex(makeBody(5000)))
})

test('serves built assets with explicit content types', async () => {
  const web = await start({ clientFiles: { 'client.js': 'export {}\n', 'app.css': 'body { margin: 0 }\n' } })
  const browser = web.newBrowser()
  const script = await browser.get('/assets/client.js')
  expect(script.status).toBe(200)
  expect(script.headers.get('content-type')).toContain('javascript')
  expect(script.headers.get('x-content-type-options')).toBe('nosniff')
  const styles = await browser.get('/assets/app.css')
  expect(styles.headers.get('content-type')).toContain('text/css')
  expect((await browser.get('/assets/missing.js')).status).toBe(404)
})
