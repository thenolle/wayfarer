import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntime } from '../../src/app/runtime'
import type { Runtime } from '../../src/app/runtime'
import { loadConfig } from '../../src/config/config'
import { createHttpApp } from '../../src/http/app'
import { buildAllowedHosts } from '../../src/http/middleware/security'
import { createSessionResolver } from '../../src/http/web/session-context'
import { authorizeSocket } from '../../src/http/web/socket-auth'
import { startServer } from '../../src/server/server'
import type { RunningServer } from '../../src/server/server'
import { LiveHub } from '../../src/websocket/hub'
import { collectLiveSnapshot } from '../../src/websocket/snapshot'
import { makeBody, startOrigin } from './origin'
import type { OriginState, TestOrigin } from './origin'

/**
 * A minimal browser: it keeps the session cookie, never follows redirects and
 * sends forms the way a browser does without JavaScript.
 */
export class Browser {
	cookie: string | null = null

	constructor(private readonly base: string) { }

	get(path: string, headers: Record<string, string> = {}): Promise<Response> {
		return this.send('GET', path, undefined, headers)
	}

	post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}): Promise<Response> {
		return this.send('POST', path, new URLSearchParams(fields), { 'content-type': 'application/x-www-form-urlencoded', ...headers })
	}

	/**
	 * Loads a page and returns the CSRF token from its first form.
	 */
	async csrf(path: string = '/'): Promise<string> {
		const html = await (await this.get(path)).text()
		const match = /name="csrf"[^>]*value="([0-9a-f]+)"/.exec(html)
		if (match?.[1] === undefined) throw new Error(`No CSRF token found on ${path}`)
		return match[1]
	}

	private async send(method: string, path: string, body: URLSearchParams | undefined, headers: Record<string, string>): Promise<Response> {
		const response = await fetch(`${this.base}${path}`, { method, redirect: 'manual', headers: { ...(this.cookie === null ? {} : { cookie: this.cookie }), ...headers }, ...(body === undefined ? {} : { body }) })
		const setCookie = response.headers.getSetCookie()[0]
		if (setCookie !== undefined) this.cookie = setCookie.split(';')[0] ?? null
		return response
	}
}

export interface WebFixture {
	readonly runtime: Runtime
	readonly origin: TestOrigin
	readonly base: string
	readonly hub: LiveHub
	newBrowser(): Browser
	stop(): Promise<void>
}

export interface WebOptions {
	readonly env?: Record<string, string>
	readonly origin?: Partial<OriginState>
	/** Files to place in the browser asset directory, by file name. */
	readonly clientFiles?: Record<string, string>
}

export async function startWeb(options: WebOptions = {}): Promise<WebFixture> {
	const directory = await mkdtemp(join(tmpdir(), 'wayfarer-web-'))
	const origin = startOrigin({ body: makeBody(5000), ...options.origin })
	const clientDir = join(directory, 'client')

	await mkdir(clientDir, { recursive: true })

	for (const [name, content] of Object.entries(options.clientFiles ?? {})) {
		await Bun.write(join(clientDir, name), content)
	}
	const config = loadConfig({
		WAYFARER_DATA_DIRECTORY: join(directory, 'data'),
		WAYFARER_CLIENT_DIRECTORY: clientDir,
		WAYFARER_ALLOW_PRIVATE_NETWORKS: '127.0.0.1',
		WAYFARER_RETRY_BASE_DELAY_MS: '1',
		WAYFARER_RETRY_MAX_DELAY_MS: '5',
		...options.env
	})
	const runtime = await createRuntime(config)
	await runtime.start()
	const sessions = createSessionResolver(config)
	const hub = new LiveHub(() => collectLiveSnapshot(runtime), { intervalMs: 50 })
	const allowedHosts = buildAllowedHosts(config)
	const server: RunningServer = startServer(createHttpApp(runtime, sessions), { hostname: '127.0.0.1', port: 0 }, { hub, authorize: (request) => authorizeSocket(request, { allowedHosts, authToken: config.authToken, sessions }) })
	const base = server.url.href.replace(/\/$/, '')
	return {
		runtime,
		origin,
		base,
		hub,
		newBrowser: () => new Browser(base),
		async stop() {
			hub.stop()
			await server.stop()
			await runtime.shutdown()
			await origin.stop()
			await rm(directory, { recursive: true, force: true })
		}
	}
}
