import { CookieJar } from '../src/downloads/http/cookies'
import { BROWSER_HEADERS, BROWSER_USER_AGENT } from '../src/downloads/http/headers'
import { findDownloadEndpoint } from '../src/downloads/resolvers/buzzheavier'

const SHOWN = ['server', 'cf-mitigated', 'content-type', 'content-length', 'retry-after', 'accept-ranges']

function label(url: URL): string {
	return `${url.origin}${url.pathname}`
}

async function step(name: string, url: URL, headers: Record<string, string>, jar: CookieJar): Promise<Response> {
	const cookie = jar.header(url)
	const response = await fetch(url, { headers: cookie === null ? headers : { ...headers, Cookie: cookie }, redirect: 'manual' })
	jar.store(url, response.headers.getSetCookie())
	console.log(`\n${name}: HTTP ${response.status} ${label(url)}`)
	for (const header of SHOWN) {
		const value = response.headers.get(header)
		if (value !== null) console.log(`  ${header}: ${value}`)
	}
	const next = response.headers.get('hx-redirect') ?? response.headers.get('location')
	if (next !== null) console.log(`  next: ${label(new URL(next, url))}`)
	return response
}

const input = process.argv[2]
if (input === undefined) {
	console.error('Usage: bun scripts/trace-resolver.ts <buzzheavier page url>')
	process.exit(1)
}

const page = new URL(input)
const jar = new CookieJar()
const first = await step('1 landing page', page, { ...BROWSER_HEADERS }, jar)
const html = await first.text()
if (!first.ok) process.exit(0)

const endpoint = findDownloadEndpoint(html, page)
const second = await step('2 download request', endpoint, { ...BROWSER_HEADERS, Accept: '*/*', 'HX-Request': 'true', 'HX-Current-URL': page.href, Referer: page.href }, jar)
void second.body?.cancel()
const next = second.headers.get('hx-redirect') ?? second.headers.get('location')
if (next === null) process.exit(0)

const third = await step('3 file request', new URL(next, endpoint), { 'User-Agent': BROWSER_USER_AGENT, Accept: '*/*', Referer: page.href, Range: 'bytes=0-0' }, jar)
void third.body?.cancel()
