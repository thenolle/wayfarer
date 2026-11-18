import type { Middleware } from '@gambrel/core'
import type { AppConfig } from '../../config/config'
import { isSecureRequest, parseCookies, serializeSessionCookie } from './cookies'
import { SessionStore } from './session'
import type { Session } from './session'
import { withHeaders } from '../middleware/headers'

export const SESSION_COOKIE = 'wayfarer_session'

interface ResolvedSession {
	readonly session: Session
	readonly isNew: boolean
}

/**
 * Finds the session for a request, creating one when the browser has none.
 *
 * Sessions are created lazily, only for requests that ask for one, so API
 * clients and scanners do not fill the store. Without a configured access
 * token every session counts as signed in, because the server is then only
 * reachable from the local machine.
 */
export class SessionResolver {
	private readonly resolved = new WeakMap<Request, ResolvedSession>()

	constructor(readonly store: SessionStore, private readonly autoAuthenticate: boolean) { }

	resolve(request: Request): ResolvedSession {
		const known = this.resolved.get(request)
		if (known !== undefined) return known
		const existing = this.peek(request)
		const entry: ResolvedSession = existing === null ? { session: this.store.create(this.autoAuthenticate), isNew: true } : { session: existing, isNew: false }
		this.resolved.set(request, entry)
		return entry
	}

	/**
	 * The session named by the request's cookie, without creating one.
	 */
	peek(request: Request): Session | null {
		return this.store.get(parseCookies(request.headers.get('cookie')).get(SESSION_COOKIE))
	}

	/**
	 * Swaps in a new session for this request, used after signing in so a
	 * pre-login session id can never be reused.
	 */
	replace(request: Request, session: Session): void {
		this.resolved.set(request, { session, isNew: true })
	}

	/**
	 * Adds `Set-Cookie` to responses for requests that received a new session.
	 */
	middleware(): Middleware {
		return async (context, next) => {
			const response = await next()
			const entry = this.resolved.get(context.request)
			if (entry === undefined || !entry.isNew) return response
			const cookie = serializeSessionCookie(SESSION_COOKIE, entry.session.id, this.store.ttlSeconds, isSecureRequest(context.request))
			return withHeaders(response, (headers) => headers.append('set-cookie', cookie))
		}
	}
}

export function createSessionResolver(config: Pick<AppConfig, 'authToken'>): SessionResolver {
	return new SessionResolver(new SessionStore(), config.authToken === null)
}
