import { errorResponse } from '../api/errors'
import { hostnameOf, isAuthorized } from '../middleware/security'
import type { SessionResolver } from './session-context'

export interface SocketAuthOptions {
	readonly allowedHosts: ReadonlySet<string>
	readonly authToken: string | null
	readonly sessions: SessionResolver
}

/**
 * Decides whether a WebSocket upgrade may proceed. Returns a rejection
 * response, or null when the connection is allowed.
 *
 * The `Host` must be an allowed name. Clients that present the bearer token
 * are accepted as they are. Browsers must send an `Origin` equal to the host
 * they connect to, which stops other websites from opening the socket, and,
 * when a token is configured, must carry a signed-in session cookie.
 */
export function authorizeSocket(request: Request, options: SocketAuthOptions): Response | null {
	const host = request.headers.get('host')
	const hostname = hostnameOf(host)
	if (hostname === null || !options.allowedHosts.has(hostname)) return errorResponse(421, 'misdirected_request', 'This host name is not allowed')
	const hasBearer = options.authToken !== null && isAuthorized(request.headers.get('authorization'), options.authToken)
	if (hasBearer) return null
	const origin = request.headers.get('origin')
	let originHost: string | null = null
	if (origin !== null) try { originHost = new URL(origin).host.toLowerCase() } catch { originHost = null }
	if (originHost === null || originHost !== host?.toLowerCase()) return errorResponse(403, 'forbidden_origin', 'Cross-site connections are not allowed')
	if (options.authToken !== null && options.sessions.peek(request)?.authenticated !== true) return errorResponse(401, 'unauthorized', 'Authentication is required')
	return null
}
