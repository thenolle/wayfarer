export interface OriginState {
	body: Uint8Array
	etag: string | null
	lastModified: string | null
	ranges: 'ok' | 'ignore' | 'bad-content-range'
	head: boolean
	disposition: string | null
	failures: { status: number; remaining: number }
	/** When set, bodies are streamed in slow chunks. */
	slow: { chunkBytes: number; delayMs: number } | null
	onRequest: ((count: number) => void) | null
}

export interface RecordedRequest {
	readonly method: string
	readonly path: string
	readonly range: string | null
	readonly ifRange: string | null
}

export interface TestOrigin {
	readonly url: string
	readonly state: OriginState
	readonly requests: RecordedRequest[]
	stop(): Promise<void>
}

/**
 * Deterministic pseudo-random bytes, so tests can compare file contents.
 */
export function makeBody(size: number, seed: number = 1): Uint8Array {
	const body = new Uint8Array(size)
	for (let index = 0; index < size; index += 1) body[index] = (index * 31 + seed * 17 + (index >>> 8)) % 251
	return body
}

function slowBody(data: Uint8Array, slow: { chunkBytes: number; delayMs: number }): ReadableStream<Uint8Array> {
	let offset = 0
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (offset >= data.length) {
				controller.close()
				return
			}
			await Bun.sleep(slow.delayMs)
			const next = Math.min(offset + slow.chunkBytes, data.length)
			controller.enqueue(data.slice(offset, next))
			offset = next
		}
	})
}

/**
 * Starts a local HTTP origin on a random loopback port. `/file` serves
 * `state.body` with behaviour controlled by `state`; `/redirect` redirects to
 * `/file`; `/redirect-private` redirects to a private address.
 */
export function startOrigin(overrides: Partial<OriginState> = {}): TestOrigin {
	const state: OriginState = {
		body: makeBody(1024),
		etag: '"v1"',
		lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT',
		ranges: 'ok',
		head: true,
		disposition: null,
		failures: { status: 503, remaining: 0 },
		slow: null,
		onRequest: null,
		...overrides
	}
	const requests: RecordedRequest[] = []
	const payload = (bytes: Uint8Array): BodyInit => (
		state.slow === null
			? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
			: slowBody(bytes, state.slow)
	)
	function serveFile(request: Request): Response {
		const length = state.body.length
		const headers: Record<string, string> = { 'content-type': 'application/octet-stream', 'accept-ranges': state.ranges === 'ignore' ? 'none' : 'bytes' }
		if (state.etag !== null) headers['etag'] = state.etag
		if (state.lastModified !== null) headers['last-modified'] = state.lastModified
		if (state.disposition !== null) headers['content-disposition'] = state.disposition
		if (request.method === 'HEAD') return new Response(null, { headers: { ...headers, 'content-length': String(length) } })
		const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '')
		const ifRange = request.headers.get('if-range')
		const rangeUsable = match !== null && state.ranges !== 'ignore' && (ifRange === null || ifRange === state.etag)
		if (match !== null && rangeUsable) {
			const start = Number(match[1])
			const end = Math.min(match[2] === '' ? length - 1 : Number(match[2]), length - 1)
			const contentRange = state.ranges === 'bad-content-range' ? `bytes 5-5/${length}` : `bytes ${start}-${end}/${length}`
			return new Response(payload(state.body.slice(start, end + 1)), { status: 206, headers: { ...headers, 'content-range': contentRange } })
		}
		return new Response(payload(state.body), { headers })
	}
	const server = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		fetch(request) {
			const url = new URL(request.url)
			requests.push({ method: request.method, path: url.pathname, range: request.headers.get('range'), ifRange: request.headers.get('if-range') })
			state.onRequest?.(requests.length)
			if (url.pathname === '/redirect') return new Response(null, { status: 302, headers: { location: '/file' } })
			if (url.pathname === '/redirect-private') return new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/secret' } })
			if (url.pathname !== '/file') return new Response('not found', { status: 404 })
			if (state.failures.remaining > 0) {
				state.failures.remaining -= 1
				return new Response('unavailable', { status: state.failures.status })
			}
			if (request.method === 'HEAD' && !state.head) return new Response(null, { status: 405 })
			return serveFile(request)
		}
	})
	return {
		url: `http://127.0.0.1:${server.port}`,
		state,
		requests,
		stop: () => server.stop(true)
	}
}
