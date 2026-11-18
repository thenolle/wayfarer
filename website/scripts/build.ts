import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { root, writeAssets } from '../src/assets'
import { buildSearchIndex, loadSite } from '../src/pipeline'
import { pageUrl } from '../src/seo'
import { pageData, renderDocument } from '../src/shell'
import { SITE, siteUrl } from '../src/site'
import { escapeHtml } from '../src/text'
import { serviceWorkerSource } from '../src/worker-source'

const docs = join(root, '..', 'docs')
const dist = join(root, 'dist')
const url = siteUrl(process.env['SITE_URL'])
const site = await loadSite(docs, url, { git: true })

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await writeAssets(dist, true)

const contents = new Map<string, string>()

async function write(file: string, content: string): Promise<void> {
	const target = join(dist, file)
	await mkdir(dirname(target), { recursive: true })
	await writeFile(target, content, 'utf8')
	contents.set(file, content)
}

const options = { serviceWorker: true }
await write('index.html', renderDocument(site, { kind: 'home' }, options))
for (const page of site.pages) {
	await write(`${page.path}/index.html`, renderDocument(site, { kind: 'page', page }, options))
	await write(`content/${page.path}.json`, JSON.stringify(pageData(site, page)))
}
await write('404.html', renderDocument(site, { kind: 'missing' }, options))
await write('search-index.json', JSON.stringify(buildSearchIndex(site)))

const newest = [site.home.updated, ...site.pages.map((page) => page.updated)].filter((value): value is string => value !== null).sort().at(-1)
const entry = (path: string, updated: string | null): string => `  <url><loc>${escapeHtml(pageUrl(url, path))}</loc>${updated === null ? '' : `<lastmod>${updated.slice(0, 10)}</lastmod>`}</url>`
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[entry('', newest ?? null), ...site.pages.map((page) => entry(page.path, page.updated))].join('\n')}\n</urlset>\n`)
await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', url).href}\n`)
await write('llms.txt', `# ${SITE.name}\n\n> ${SITE.description}\n\n## Documentation\n\n${site.pages.map((page) => `- [${page.heading}](${pageUrl(url, page.path)}): ${page.description}`).join('\n')}\n`)
await write('manifest.webmanifest', JSON.stringify({
	id: site.base,
	name: `${SITE.name} documentation`,
	short_name: `${SITE.name} docs`,
	description: SITE.description,
	start_url: site.base,
	scope: site.base,
	display: 'standalone',
	lang: 'en',
	theme_color: SITE.themeLight,
	background_color: SITE.themeDark,
	icons: [
		{ src: `${site.base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
		{ src: `${site.base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
		{ src: `${site.base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
	]
}))
await write('.nojekyll', '')

const hash = createHash('sha256')
for (const [file, content] of [...contents].sort(([a], [b]) => a.localeCompare(b))) hash.update(file).update(content)
hash.update(await Bun.file(join(dist, 'assets', 'app.js')).bytes()).update(await Bun.file(join(dist, 'assets', 'site.css')).bytes())
const version = hash.digest('hex').slice(0, 12)

const skipped = new Set(['.nojekyll', 'robots.txt', 'sitemap.xml', 'llms.txt'])
const toUrl = (file: string): string => (file === 'index.html' ? site.base : file.endsWith('/index.html') ? `${site.base}${file.slice(0, -'index.html'.length)}` : `${site.base}${file}`)
const precache = [...contents.keys()].filter((file) => !skipped.has(file)).map(toUrl).concat(['assets/app.js', 'assets/site.css', 'favicon.svg', 'icons/icon-32.png', 'icons/icon-192.png'].map((file) => `${site.base}${file}`))
await write('sw.js', serviceWorkerSource(site.base, version, precache))

console.log(`Website written to ${dist}: ${site.pages.length + 1} pages, ${precache.length} files cached for offline use (version ${version})`)
