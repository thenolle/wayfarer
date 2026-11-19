import { DEFAULT_USER_AGENT } from '../http/headers'
import { segmentName } from './hints'
import type { ResolvedSource, UrlResolver } from './types'

const HOSTS = new Set(['github.com', 'www.github.com'])
const BLOB = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/

/**
 * Turns GitHub file page links (`.../blob/<ref>/<path>`) into the "Raw" link,
 * which GitHub redirects to its file host. Release assets and archives are
 * already direct links and need no resolver.
 */
export class GitHubResolver implements UrlResolver {
	readonly name = 'github'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		return HOSTS.has(url.hostname.toLowerCase()) && BLOB.test(url.pathname)
	}

	async resolve(url: URL): Promise<ResolvedSource> {
		const [, owner = '', repository = '', rest = ''] = BLOB.exec(url.pathname) ?? []
		const target = new URL(`/${owner}/${repository}/raw/${rest}`, 'https://github.com')
		return { resolver: this.name, url: target.href, headers: { 'User-Agent': DEFAULT_USER_AGENT }, filenameHint: segmentName(rest.split('/').at(-1)) }
	}
}
