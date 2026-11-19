import { DEFAULT_USER_AGENT } from '../http/headers'
import type { ResolvedSource, UrlResolver } from './types'

const HOSTS = new Set(['1drv.ms', 'onedrive.live.com'])

/**
 * Resolves personal OneDrive sharing links through the Shares API: the link is
 * encoded as `u!` + unpadded base64url and fetched from `/root/content`.
 * OneDrive for Business and SharePoint always need a sign-in and are not
 * supported.
 */
export class OneDriveResolver implements UrlResolver {
	readonly name = 'onedrive'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		return HOSTS.has(url.hostname.toLowerCase())
	}

	async resolve(url: URL): Promise<ResolvedSource> {
		const token = `u!${Buffer.from(url.href, 'utf8').toString('base64url')}`
		return { resolver: this.name, url: `https://api.onedrive.com/v1.0/shares/${token}/root/content`, headers: { 'User-Agent': DEFAULT_USER_AGENT }, filenameHint: null }
	}
}
