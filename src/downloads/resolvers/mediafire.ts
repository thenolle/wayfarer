import { CookieJar } from '../http/cookies'
import { failAt, ResolverError } from '../http/errors'
import { assertNoChallenge, assertOk, BROWSER_HEADERS, BROWSER_USER_AGENT, discardBody, readTextLimited } from '../http/headers'
import type { ResolvedSource, ResolverContext, UrlResolver } from './types'

const PAGE_PATHS = /^\/(?:file|file_premium|download|view)\//i
const BUTTON_TAG = /<a\b[^>]*\bid\s*=\s*["']downloadButton["'][^>]*>/i
const MAX_PAGE_BYTES = 2_000_000
const PAGE_READ_TIMEOUT_MS = 15_000

function attribute(tag: string, name: string): string | null {
	const match = new RegExp(`(?<=\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
	const value = match?.[1] ?? match?.[2]
	return value === undefined ? null : value.replaceAll('&amp;', '&')
}

function httpUrl(value: string | null, base: URL): URL | null {
	if (value === null || value === '') return null
	try {
		const url = new URL(value, base)
		return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
	} catch { return null }
}

/**
 * Finds the file location in a MediaFire file page: the base64 `data-scrambled-url`
 * of the download button when present, otherwise its plain `href`. Returns null
 * when the page offers no usable link.
 */
export function findMediafireLink(html: string, pageUrl: URL): URL | null {
	const tag = BUTTON_TAG.exec(html)?.[0]
	if (tag === undefined) return null
	const scrambled = attribute(tag, 'data-scrambled-url')
	if (scrambled !== null) {
		const decoded = httpUrl(Buffer.from(scrambled, 'base64').toString('utf8'), pageUrl)
		if (decoded !== null) return decoded
	}
	return httpUrl(attribute(tag, 'href'), pageUrl)
}

/**
 * Resolves MediaFire file pages (`mediafire.com/file/...`).
 *
 * It loads the page the way a visitor would and reads the link behind the
 * download button. It does not handle folders, passwords, CAPTCHAs or logins;
 * if no link is offered, that is reported.
 *
 * This resolver has been tested against simulated pages only, not the live
 * service, whose markup may change.
 */
export class MediafireResolver implements UrlResolver {
	readonly name = 'mediafire'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		return url.hostname.toLowerCase().replace(/^www\./, '') === 'mediafire.com' && PAGE_PATHS.test(url.pathname)
	}

	async resolve(url: URL, context: ResolverContext): Promise<ResolvedSource> {
		const jar = new CookieJar()
		const page = await context.fetch(url, { headers: BROWSER_HEADERS, jar, signal: context.signal })
		assertNoChallenge(page.response, 'MediaFire')
		try { assertOk(page.response) } catch (error) { failAt('MediaFire page', error) }
		const type = page.response.headers.get('content-type') ?? ''
		if (!type.toLowerCase().startsWith('text/html')) {
			discardBody(page.response)
			return this.source(page.url, url, jar)
		}
		const html = await readTextLimited(page.response, MAX_PAGE_BYTES, PAGE_READ_TIMEOUT_MS)
		const target = findMediafireLink(html, page.url)
		if (target === null) throw new ResolverError('MediaFire did not offer a download link. The file may be removed, password-protected or need a browser.')
		return this.source(target, page.url, jar)
	}

	private source(target: URL, referer: URL, jar: CookieJar): ResolvedSource {
		const cookie = jar.header(target)
		return {
			resolver: this.name,
			url: target.href,
			headers: {
				'User-Agent': BROWSER_USER_AGENT,
				Accept: '*/*',
				Referer: referer.href,
				...(cookie === null ? {} : { Cookie: cookie })
			},
			filenameHint: null
		}
	}
}
