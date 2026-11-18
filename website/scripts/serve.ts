import { join, sep } from 'node:path'
import { root, writeAssets } from '../src/assets'
import { buildSearchIndex, loadSite } from '../src/pipeline'
import { pageData, renderDocument } from '../src/shell'
import { siteUrl } from '../src/site'

const port = Number(process.env['PORT'] ?? 4321)
const url = siteUrl(`http://localhost:${port}/`)
const docs = join(root, '..', 'docs')
const out = join(root, '.dev')
const options = { serviceWorker: false }
const STATIC = ['/assets/', '/icons/', '/favicon.svg', '/social.png', '/manifest.webmanifest']

await writeAssets(out, false)

function html(body: string, status = 200): Response {
	return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

function json(value: unknown): Response {
	return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

Bun.serve({
	port,
	async fetch(request) {
		const { pathname } = new URL(request.url)
		if (STATIC.some((prefix) => pathname.startsWith(prefix))) {
			const target = join(out, decodeURIComponent(pathname))
			if (!target.startsWith(out + sep)) return new Response('Forbidden', { status: 403 })
			const file = Bun.file(target)
			return (await file.exists()) ? new Response(file, { headers: { 'cache-control': 'no-store' } }) : new Response('Not found', { status: 404 })
		}
		try {
			const site = await loadSite(docs, url, { git: false })
			if (pathname === '/search-index.json') return json(buildSearchIndex(site))
			const content = /^\/content\/(.+)\.json$/.exec(pathname)
			if (content !== null) {
				const page = site.pages.find((candidate) => candidate.path === content[1])
				return page === undefined ? new Response('Not found', { status: 404 }) : json(pageData(site, page))
			}
			const path = pathname.replace(/^\/|\/$/g, '')
			if (path === '') return html(renderDocument(site, { kind: 'home' }, options))
			const page = site.pages.find((candidate) => candidate.path === path)
			if (page !== undefined) {
				if (!pathname.endsWith('/')) return Response.redirect(`${pathname}/`, 301)
				return html(renderDocument(site, { kind: 'page', page }, options))
			}
			return html(renderDocument(site, { kind: 'missing' }, options), 404)
		} catch (error) {
			return html(`<pre>${error instanceof Error ? error.message : String(error)}</pre>`, 500)
		}
	}
})

console.log(`Documentation preview: http://localhost:${port}/ (reads ../docs on every request; reload the page to see edits)`)
