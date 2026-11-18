import { timingSafeEqual } from 'node:crypto'
import type { Middleware } from '@gambrel/core'
import { isWildcardHost } from '../../config/config'
import type { AppConfig } from '../../config/config'
import { errorResponse } from '../api/errors'
import { withHeaders } from './headers'

const LOOPBACK_NAMES = ['localhost', '127.0.0.1', '[::1]']
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const HEALTH_PATH = '/api/health'
const API_PREFIX = '/api/'
const API_CSP = "default-src 'none'; frame-ancestors 'none'"
const PAGE_CSP = "default-src 'none'; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"

/**
 * The host name in a `Host` header, lower-cased, or null when it is malformed.
 */
export function hostnameOf(value: string | null): string | null {
	if (value === null) return null
	try { return new URL(`http://${value}`).hostname.toLowerCase() } catch { return null }
}

/**
 * The host names this server answers to: loopback names, the configured bind
 * address (unless it is a wildcard) and `WAYFARER_ALLOWED_HOSTS`. IPv6 names
 * use brackets, for example `[::1]`.
 */
export function buildAllowedHosts(config: Pick<AppConfig, 'host' | 'allowedHosts'>): ReadonlySet<string> {
	const hosts = new Set<string>(LOOPBACK_NAMES)
	if (!isWildcardHost(config.host)) {
		const bind = config.host.toLowerCase()
		hosts.add(bind.includes(':') && !bind.startsWith('[') ? `[${bind}]` : bind)
	}
	for (const host of config.allowedHosts) hosts.add(host)
	return hosts
}

/**
 * Adds defensive headers to every response. Pages and API responses are never
 * cached. API responses may not be embedded; pages may load only their own
 * scripts, styles and connections, and may post forms only to themselves.
 */
export function securityHeaders(): Middleware {
	return async (context, next) => {
		const response = await next()
		const defaults: Record<string, string> = {
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'same-origin',
			'x-frame-options': 'DENY',
			'cross-origin-resource-policy': 'same-origin',
			'cache-control': 'no-store',
			'content-security-policy': context.url.pathname.startsWith(API_PREFIX) ? API_CSP : PAGE_CSP
		}
		return withHeaders(response, (headers) => {
			for (const [name, value] of Object.entries(defaults)) {
				if (!headers.has(name)) headers.set(name, value)
			}
		})
	}
}

/**
 * Rejects requests whose `Host` header is not an allowed name. This stops DNS
 * rebinding attacks, where a hostile web page resolves its own domain to a
 * local address to reach a service that only listens on loopback.
 */
export function hostGuard(allowedHosts: ReadonlySet<string>): Middleware {
	return (context, next) => {
		const hostname = hostnameOf(context.request.headers.get('host'))
		if (hostname === null || !allowedHosts.has(hostname)) return errorResponse(421, 'misdirected_request', 'This host name is not allowed')
		return next()
	}
}

function digest(value: string): Uint8Array {
	return new Bun.CryptoHasher('sha256').update(value).digest()
}

/**
 * Compares secrets in constant time, so response timing does not reveal how
 * much of a guess was correct.
 */
export function tokensMatch(candidate: string, expected: string): boolean {
	return timingSafeEqual(digest(candidate), digest(expected))
}

/**
 * True when `header` is `Authorization: Bearer <token>` with the right token.
 */
export function isAuthorized(header: string | null, token: string): boolean {
	const match = header === null ? null : /^Bearer\s+(.+)$/i.exec(header.trim())
	if (match === null || match[1] === undefined) return false
	return tokensMatch(match[1], token)
}

/**
 * Requires `Authorization: Bearer <token>` on API routes when a token is
 * configured. The health endpoint stays open so monitors and container health
 * checks work. Pages, forms and WebSockets use session cookies instead.
 */
export function authGuard(token: string | null): Middleware {
	return (context, next) => {
		if (token === null || !context.url.pathname.startsWith(API_PREFIX) || context.url.pathname === HEALTH_PATH) return next()
		if (isAuthorized(context.request.headers.get('authorization'), token)) return next()
		return errorResponse(401, 'unauthorized', 'Authentication is required', { 'www-authenticate': 'Bearer' })
	}
}

/**
 * Blocks cross-site requests that change state. A request with an `Origin`
 * header must come from the same origin as the `Host` it addresses, and a
 * browser-declared `Sec-Fetch-Site: cross-site` is refused. `Origin: null` is
 * accepted only with `Sec-Fetch-Site: same-origin`. Requests without an `Origin`
 * (command-line clients, scripts) are left to authentication.
 */
export function originGuard(): Middleware {
	return (context, next) => {
		if (SAFE_METHODS.has(context.method)) return next()
		const fetchSite = context.request.headers.get('sec-fetch-site')
		if (fetchSite === 'cross-site') return errorResponse(403, 'forbidden_origin', 'Cross-site requests are not allowed')
		const origin = context.request.headers.get('origin')
		if (origin === 'null') {
			if (fetchSite !== 'same-origin') return errorResponse(403, 'forbidden_origin', 'Cross-site requests are not allowed')
			return next()
		}
		if (origin !== null) {
			let originHost: string | null
			try { originHost = new URL(origin).host.toLowerCase() } catch { originHost = null }
			const host = context.request.headers.get('host')?.toLowerCase() ?? null
			if (originHost === null || originHost !== host) return errorResponse(403, 'forbidden_origin', 'Cross-site requests are not allowed')
		}
		return next()
	}
}
