import { ResolverError } from '../http/errors'
import type { ResolvedSource, ResolverContext, UrlResolver } from './types'

export interface BrowserOnlyHost {
	readonly name: string
	readonly label: string
	readonly hosts: readonly string[]
	readonly pagePath: RegExp
}

export const DATANODES: BrowserOnlyHost = {
	name: 'datanodes',
	label: 'DataNodes',
	hosts: ['datanodes.to'],
	pagePath: /^\/[a-z0-9]{12}(?:\/[^/]+)?\/?$/i
}

/**
 * Recognises file pages of a host that puts a CAPTCHA in front of its free
 * downloads and refuses them with an explanation, instead of saving the HTML
 * page as if it were the file. Wayfarer never solves or bypasses CAPTCHAs.
 */
export class BrowserOnlyResolver implements UrlResolver {
	readonly name: string

	constructor(private readonly host: BrowserOnlyHost) {
		this.name = host.name
	}

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
		return this.host.hosts.includes(hostname) && this.host.pagePath.test(url.pathname)
	}

	resolve(_url: URL, _context: ResolverContext): Promise<ResolvedSource> {
		return Promise.reject(new ResolverError(`${this.host.label} asks for a CAPTCHA before it hands out a file, and Wayfarer does not bypass those. Open the link in your browser, finish the check, then add the final download link here instead.`))
	}
}
