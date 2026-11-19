import { ResolverError } from '../http/errors'
import { DEFAULT_USER_AGENT } from '../http/headers'
import { segmentName } from './hints'
import type { ResolvedSource, UrlResolver } from './types'

const HOSTS = new Set(['dropbox.com', 'www.dropbox.com'])
const FILE_PATH = /^\/(?:s|scl\/fi)\//i
const FOLDER_PATH = /^\/(?:sh|scl\/fo)\//i

/**
 * Resolves Dropbox shared file links (`/s/...` and `/scl/fi/...`) by asking
 * for a download (`dl=1`) instead of the preview page. Other query parameters,
 * such as `rlkey`, are kept. Shared folders are recognised and refused with an
 * explanation.
 *
 * This resolver has been tested against simulated links only, not the live
 * service.
 */
export class DropboxResolver implements UrlResolver {
	readonly name = 'dropbox'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		return HOSTS.has(url.hostname.toLowerCase()) && (FILE_PATH.test(url.pathname) || FOLDER_PATH.test(url.pathname))
	}

	async resolve(url: URL): Promise<ResolvedSource> {
		if (FOLDER_PATH.test(url.pathname)) throw new ResolverError('Dropbox folders are not supported. Open the folder and add its files one by one.')
		const target = new URL(url.href)
		target.searchParams.delete('raw')
		target.searchParams.set('dl', '1')
		const segments = target.pathname.split('/').filter((segment) => segment !== '')
		const needed = target.pathname.toLowerCase().startsWith('/scl/') ? 4 : 3
		return {
			resolver: this.name,
			url: target.href,
			headers: { 'User-Agent': DEFAULT_USER_AGENT },
			filenameHint: segments.length >= needed ? segmentName(segments.at(-1)) : null
		}
	}
}
