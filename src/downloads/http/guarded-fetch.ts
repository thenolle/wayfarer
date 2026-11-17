import type { NetworkPolicy } from '../../security/network-policy'
import type { CookieJar } from './cookies'
import { TooManyRedirectsError } from './errors'
import { discardBody } from './headers'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface GuardedRequest {
	readonly method?: 'GET' | 'HEAD'
	readonly headers?: Readonly<Record<string, string>>
	readonly signal?: AbortSignal | undefined
	readonly followRedirects?: boolean
	readonly jar?: CookieJar | undefined
}

export interface GuardedResponse {
	readonly response: Response
	/** The URL that produced `response`, after any redirects. */
	readonly url: URL
	/** Cancels the request and its body. Safe to call more than once. */
	abort(): void
}

export type GuardedFetch = (url: URL | string, request?: GuardedRequest) => Promise<GuardedResponse>

export interface GuardedFetchOptions {
	readonly policy: NetworkPolicy
	readonly headerTimeoutMs: number
	readonly maxRedirects?: number
	readonly fetchImpl?: FetchLike
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const SENSITIVE_HEADERS = new Set(['cookie', 'authorization', 'proxy-authorization'])

/**
 * Returns a copy of `headers` without credentials that must not follow a
 * request to a different origin.
 */
export function withoutSensitiveHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
	return Object.fromEntries(Object.entries(headers).filter(([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase())))
}

/**
 * Creates a `fetch` wrapper that enforces the network policy.
 *
 * - Redirects are followed manually, up to `maxRedirects` (default 10), and
 *   every hop is checked against the policy before it is requested.
 * - `Cookie` and `Authorization` headers are dropped when a redirect leaves
 *   the original origin.
 * - `headerTimeoutMs` limits the wait for response headers. It does not limit
 *   the body, so long downloads are unaffected; callers watch body stalls.
 */
export function createGuardedFetch(options: GuardedFetchOptions): GuardedFetch {
	const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init))
	const maxRedirects = options.maxRedirects ?? 10

	async function send(url: URL, method: 'GET' | 'HEAD', headers: Readonly<Record<string, string>>, signal: AbortSignal | undefined): Promise<{ response: Response; abort: () => void }> {
		const controller = new AbortController()
		const combined = signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal])
		const timer = setTimeout(() => controller.abort(new DOMException('The request timed out', 'TimeoutError')), options.headerTimeoutMs)
		try {
			const response = await fetchImpl(url.href, { method, headers, redirect: 'manual', signal: combined })
			return { response, abort: () => controller.abort() }
		} finally {
			clearTimeout(timer)
		}
	}
	return async (input, request = {}) => {
		const method = request.method ?? 'GET'
		const follow = request.followRedirects ?? true
		let url = typeof input === 'string' ? new URL(input) : input
		let headers: Readonly<Record<string, string>> = request.headers ?? {}
		for (let hops = 0; ; hops += 1) {
			await options.policy.assertAllowed(url)
			const cookie = request.jar?.header(url) ?? null
			const sent = cookie === null ? headers : { ...headers, Cookie: cookie }
			const { response, abort } = await send(url, method, sent, request.signal)
			request.jar?.store(url, response.headers.getSetCookie())
			const location = response.headers.get('location')
			if (!follow || !REDIRECT_STATUSES.has(response.status) || location === null) return { response, url, abort }
			discardBody(response)
			if (hops >= maxRedirects) throw new TooManyRedirectsError()
			const next = new URL(location, url)
			if (next.origin !== url.origin) headers = withoutSensitiveHeaders(headers)
			url = next
		}
	}
}
