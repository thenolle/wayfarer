import { CookieJar } from '../http/cookies'
import { ResolverError } from '../http/errors'
import { assertOk, BROWSER_HEADERS, BROWSER_USER_AGENT, discardBody } from '../http/headers'
import type { ResolvedSource, ResolverContext, UrlResolver } from './types'

const HOSTS = new Set(['buzzheavier.com', 'bzzhr.to', 'bzzhr.co'])
const LINK_PATTERN = /(?:hx-get|hx-post|href|data-href|data-url)\s*=\s*["']([^"']*\/download[^"']*)["']/gi
const MAX_PAGE_CHARACTERS = 2_000_000

/**
 * Finds the download endpoint in a landing page. It looks at `hx-get`,
 * `hx-post`, `href`, `data-href` and `data-url` attributes whose value
 * contains `/download`, and falls back to `<page path>/download`.
 */
export function findDownloadEndpoint(html: string, pageUrl: URL): URL {
	for (const match of html.matchAll(LINK_PATTERN)) {
		const value = match[1]
		if (value === undefined) continue
		try { return new URL(value.replaceAll('&amp;', '&'), pageUrl) } catch { continue }
	}
	return new URL(`${pageUrl.pathname.replace(/\/+$/, '')}/download`, pageUrl)
}

/**
 * Resolves Buzzheavier file pages (`buzzheavier.com`, `bzzhr.to`, `bzzhr.co`).
 *
 * The flow mirrors what a browser does: load the landing page, request its
 * `/download` endpoint the way the page's HTMX script would (with `HX-Request`
 * and the page as `Referer`), and read the file location from the `HX-Redirect`
 * header or a redirect. Cookies set along the way are kept for the session.
 *
 * It makes no attempt to get around CAPTCHAs or access controls. If the host
 * refuses or rate-limits the request, that error is reported.
 *
 * This resolver has been tested against simulated responses only, not the live
 * service, whose behaviour may change.
 */
export class BuzzheavierResolver implements UrlResolver {
	readonly name = 'buzzheavier'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		return HOSTS.has(url.hostname.toLowerCase().replace(/^www\./, ''))
	}

	async resolve(url: URL, context: ResolverContext): Promise<ResolvedSource> {
		const jar = new CookieJar()
		const page = await context.fetch(url, { headers: BROWSER_HEADERS, jar, signal: context.signal })
		assertOk(page.response)
		const html = (await page.response.text()).slice(0, MAX_PAGE_CHARACTERS)
		const endpoint = findDownloadEndpoint(html, page.url)
		const step = await context.fetch(endpoint, {
			headers: {
				...BROWSER_HEADERS,
				Accept: '*/*',
				'HX-Request': 'true',
				'HX-Current-URL': page.url.href,
				Referer: page.url.href
			},
			jar,
			followRedirects: false,
			signal: context.signal
		})
		const target = this.locateFile(step.response, step.url)
		const cookie = jar.header(target)
		return {
			resolver: this.name,
			url: target.href,
			headers: {
				'User-Agent': BROWSER_USER_AGENT,
				Accept: '*/*',
				Referer: page.url.href,
				...(cookie === null ? {} : { Cookie: cookie })
			},
			filenameHint: null
		}
	}

	private locateFile(response: Response, endpoint: URL): URL {
		const hxRedirect = response.headers.get('hx-redirect')
		const redirect = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
		const next = hxRedirect ?? redirect
		if (next !== null) {
			discardBody(response)
			return new URL(next, endpoint)
		}
		assertOk(response)
		const type = response.headers.get('content-type') ?? ''
		if (!type.toLowerCase().startsWith('text/html')) {
			discardBody(response)
			return endpoint
		}
		discardBody(response)
		throw new ResolverError('The hosting page did not provide a download link')
	}
}
