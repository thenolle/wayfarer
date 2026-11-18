import { SITE } from './site'
import { escapeHtml, truncate } from './text'

export interface Crumb {
	readonly name: string
	readonly path: string
}

export interface PageMeta {
	readonly kind: 'home' | 'article' | 'missing'
	readonly path: string
	readonly title: string
	readonly description: string
	readonly updated: string | null
	readonly crumbs: readonly Crumb[]
}

export function pageUrl(site: URL, path: string): string {
	return new URL(path === '' ? '' : `${path}/`, site).href
}

function json(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function seoHead(meta: PageMeta, site: URL, serviceWorker: boolean): string {
	const root = pageUrl(site, '')
	const url = meta.kind === 'missing' ? root : pageUrl(site, meta.path)
	const title = meta.kind === 'home' ? `${SITE.name}: ${SITE.tagline}` : `${meta.title} · ${SITE.name}`
	const description = truncate(meta.description === '' ? SITE.description : meta.description, 158)
	const image = new URL('social.png', site).href
	const robots = meta.kind === 'missing' ? 'noindex,follow' : 'index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1'
	const author = { '@type': 'Person', name: SITE.author, url: SITE.authorUrl }
	const graph: unknown[] = [
		{ '@type': 'WebSite', '@id': `${root}#website`, url: root, name: SITE.name, description: SITE.description, inLanguage: 'en' },
		{ '@type': 'SoftwareApplication', '@id': `${root}#software`, name: SITE.name, description: SITE.description, url: root, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Windows, macOS, Linux', license: SITE.license, author, sameAs: [SITE.repo] }
	]
	if (meta.kind === 'article') {
		graph.push(
			{
				'@type': 'TechArticle',
				'@id': `${url}#article`,
				headline: meta.title,
				description,
				url,
				mainEntityOfPage: url,
				inLanguage: 'en',
				image,
				...(meta.updated === null ? {} : { dateModified: meta.updated }),
				isPartOf: { '@id': `${root}#website` },
				about: { '@id': `${root}#software` },
				author,
				publisher: author
			},
			{ '@type': 'BreadcrumbList', itemListElement: meta.crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: pageUrl(site, crumb.path) })) }
		)
	}
	const base = site.pathname
	const tags = [
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapeHtml(title)}</title>`,
		`<meta name="description" content="${escapeHtml(description)}">`,
		`<link rel="canonical" href="${url}">`,
		`<meta name="robots" content="${robots}">`,
		'<meta name="color-scheme" content="light dark">',
		`<meta name="theme-color" content="${SITE.themeLight}" media="(prefers-color-scheme: light)">`,
		`<meta name="theme-color" content="${SITE.themeDark}" media="(prefers-color-scheme: dark)">`,
		`<meta name="author" content="${SITE.author}">`,
		`<meta property="og:site_name" content="${SITE.name}">`,
		`<meta property="og:type" content="${meta.kind === 'article' ? 'article' : 'website'}">`,
		`<meta property="og:title" content="${escapeHtml(title)}">`,
		`<meta property="og:description" content="${escapeHtml(description)}">`,
		`<meta property="og:url" content="${url}">`,
		`<meta property="og:locale" content="en_US">`,
		`<meta property="og:image" content="${image}">`,
		'<meta property="og:image:width" content="1200">',
		'<meta property="og:image:height" content="630">',
		`<meta property="og:image:alt" content="${SITE.name}, a background download manager">`,
		'<meta name="twitter:card" content="summary_large_image">',
		`<meta name="twitter:title" content="${escapeHtml(title)}">`,
		`<meta name="twitter:description" content="${escapeHtml(description)}">`,
		`<meta name="twitter:image" content="${image}">`,
		`<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">`,
		`<link rel="icon" href="${base}icons/icon-32.png" sizes="32x32" type="image/png">`,
		`<link rel="apple-touch-icon" href="${base}icons/icon-180.png">`,
		`<link rel="manifest" href="${base}manifest.webmanifest">`,
		`<link rel="sitemap" type="application/xml" href="${base}sitemap.xml">`,
		serviceWorker ? '<meta name="wayfarer:sw" content="on">' : '',
		`<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>`
	]
	if (meta.kind === 'article' && meta.updated !== null) tags.push(`<meta property="article:modified_time" content="${meta.updated}">`)
	return tags.filter((tag) => tag !== '').join('\n')
}
