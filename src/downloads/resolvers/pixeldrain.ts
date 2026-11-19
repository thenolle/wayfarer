import { failAt, ResolverError } from '../http/errors'
import { assertOk, DEFAULT_USER_AGENT, discardBody, readTextLimited } from '../http/headers'
import type { ResolvedSource, ResolverContext, UrlResolver } from './types'

const HOSTS = new Set(['pixeldrain.com', 'www.pixeldrain.com', 'pixeldrain.net', 'www.pixeldrain.net'])
const FILE = /^\/(?:u|api\/file)\/([A-Za-z0-9_-]{4,32})\/?$/
const LIST = /^\/(?:l|api\/list)\//
const MAX_INFO_BYTES = 100_000
const INFO_READ_TIMEOUT_MS = 10_000

function nameFrom(text: string): string | null {
	try {
		const name = (JSON.parse(text) as { name?: unknown }).name
		return typeof name === 'string' && name !== '' ? name : null
	} catch {
		return null
	}
}

/**
 * Resolves Pixeldrain file pages (`/u/<id>`) to the file API and reads the
 * original file name from the file's info. Lists are recognised and refused
 * with an explanation.
 *
 * This resolver has been tested against simulated responses only, not the
 * live service.
 */
export class PixeldrainResolver implements UrlResolver {
	readonly name = 'pixeldrain'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		return HOSTS.has(url.hostname.toLowerCase()) && (FILE.test(url.pathname) || LIST.test(url.pathname))
	}

	async resolve(url: URL, context: ResolverContext): Promise<ResolvedSource> {
		const id = FILE.exec(url.pathname)?.[1]
		if (id === undefined) throw new ResolverError('Pixeldrain lists are not supported. Open the list and add each file link.')
		const info = await context.fetch(new URL(`/api/file/${id}/info`, url.origin), { headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' }, signal: context.signal })
		if (info.response.status === 404) {
			discardBody(info.response)
			throw new ResolverError('Pixeldrain could not find that file. It may have expired or been removed.')
		}
		try { assertOk(info.response) } catch (error) { failAt('Pixeldrain file info', error) }
		const filenameHint = nameFrom(await readTextLimited(info.response, MAX_INFO_BYTES, INFO_READ_TIMEOUT_MS))
		return {
			resolver: this.name,
			url: new URL(`/api/file/${id}`, url.origin).href,
			headers: { 'User-Agent': DEFAULT_USER_AGENT },
			filenameHint
		}
	}
}
