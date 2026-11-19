import { ResolverError } from '../http/errors'
import { DEFAULT_USER_AGENT } from '../http/headers'
import { segmentName } from './hints'
import type { ResolvedSource, UrlResolver } from './types'

const HOSTS = new Set(['huggingface.co', 'www.huggingface.co', 'hf.co'])
const FILE = /^\/((?:datasets\/|spaces\/)?[^/]+\/[^/]+)\/(?:blob|resolve)\/([^/]+)\/(.+)$/

/**
 * Turns Hugging Face file page links (`.../blob/<revision>/<path>`) and
 * `resolve` links into download links with `?download=true`. It handles
 * models, datasets and spaces. Public repositories only: gated or private
 * files fail with the server's HTTP 401 or 403, because Wayfarer sends no
 * credentials.
 *
 * This resolver has been tested against simulated links only, not the live
 * service.
 */
export class HuggingFaceResolver implements UrlResolver {
	readonly name = 'huggingface'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		return HOSTS.has(url.hostname.toLowerCase()) && FILE.test(url.pathname)
	}

	async resolve(url: URL): Promise<ResolvedSource> {
		const match = FILE.exec(url.pathname)
		if (match === null) throw new ResolverError('That Hugging Face link does not point to a file')
		const [repository = '', revision = '', path = ''] = match.slice(1)
		const target = new URL(`/${repository}/resolve/${revision}/${path}`, 'https://huggingface.co')
		target.searchParams.set('download', 'true')
		return {
			resolver: this.name,
			url: target.href,
			headers: { 'User-Agent': DEFAULT_USER_AGENT },
			filenameHint: segmentName(path.split('/').at(-1))
		}
	}
}
