import type { Page, Site } from './pipeline'
import { seoHead } from './seo'
import type { PageMeta } from './seo'
import { SITE } from './site'
import { escapeHtml } from './text'
import type { Heading, PageData } from './types'

export interface DocumentOptions {
	readonly serviceWorker: boolean
}

export type View = { readonly kind: 'home' } | { readonly kind: 'page'; readonly page: Page } | { readonly kind: 'missing' }

const THEME_SCRIPT = "(function(){try{var t=localStorage.getItem('wayfarer-docs-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}document.documentElement.classList.add('js')})()"
const LOGO = '<svg viewBox="0 0 64 64" width="18" height="18" aria-hidden="true"><path d="M32 14v24m0 0-10-10m10 10 10-10M18 46h28" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const FEATURES: readonly (readonly [string, string])[] = [
	['Resumable downloads', 'Parallel byte-range segments, retries with backoff and optional checksums. Interrupted transfers continue from the exact byte.'],
	['Remembers everything', 'Progress lives in SQLite. After a crash, Wayfarer reconciles its records with the files on disk.'],
	['Safe by default', 'Listens on loopback, refuses private networks, checks every redirect and protects forms with CSRF tokens.'],
	['A dashboard that just works', 'Server-rendered and usable without JavaScript, with live progress, search, bulk actions and dark mode.'],
	['A REST API', 'Add, pause, resume and stream downloads from scripts with a bearer token.'],
	['Runs anywhere', 'Docker, systemd, Windows Task Scheduler or macOS launchd.']
]

const href = (site: Site, path: string): string => (path === '' ? site.base : `${site.base}${path}/`)

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export function sidebarHtml(site: Site, current: string): string {
	return site.nav.sections
		.map((section) => {
			const items = section.pages.map((page) => `<li><a href="${href(site, page.path)}"${page.path === current ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a></li>`).join('')
			return `<section class="nav-section"><h2>${escapeHtml(section.title)}</h2><ul>${items}</ul></section>`
		})
		.join('')
}

export function tocHtml(headings: readonly Heading[]): string {
	if (headings.length === 0) return ''
	const items = headings.map((heading) => `<li class="lvl-${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`).join('')
	return `<div class="toc-inner"><h2>On this page</h2><ul>${items}</ul></div>`
}

export function articleBlock(site: Site, page: Page): string {
	const index = site.pages.indexOf(page)
	const previous = site.pages[index - 1]
	const next = site.pages[index + 1]
	const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="${site.base}">Docs</a></li><li>${escapeHtml(page.section)}</li><li aria-current="page">${escapeHtml(page.heading)}</li></ol></nav>`
	const updated = page.updated === null ? '' : `Last updated <time datetime="${page.updated}">${formatDate(page.updated)}</time> · `
	const meta = `<p class="doc-meta">${updated}<a href="${SITE.repo}/edit/${SITE.branch}/docs/${page.path}.md" rel="noopener">Edit this page on GitHub</a></p>`
	const previousCard = previous === undefined ? '<span></span>' : `<a class="pager-card prev" href="${href(site, previous.path)}"><span>Previous</span>${escapeHtml(previous.heading)}</a>`
	const nextCard = next === undefined ? '' : `<a class="pager-card next" href="${href(site, next.path)}"><span>Next</span>${escapeHtml(next.heading)}</a>`
	const pager = previous === undefined && next === undefined ? '' : `<nav class="pager" aria-label="More pages">${previousCard}${nextCard}</nav>`
	return `${crumbs}<article class="doc">${page.html}</article>${meta}${pager}`
}

export function pageData(site: Site, page: Page): PageData {
	return { path: page.path, title: page.heading, description: page.description, html: articleBlock(site, page), headings: page.headings, updated: page.updated }
}

function homeBlock(site: Site): string {
	const cards = FEATURES.map(([title, text]) => `<li class="card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></li>`).join('')
	const sections = site.nav.sections
		.map((section) => {
			const items = section.pages
				.map((entry) => {
					const page = site.pages.find((candidate) => candidate.path === entry.path)
					return `<li class="card"><a href="${href(site, entry.path)}"><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(page?.description ?? entry.summary)}</p></a></li>`
				})
				.join('')
			return `<section class="home-section"><h2>${escapeHtml(section.title)}</h2><ul class="card-grid">${items}</ul></section>`
		})
		.join('')
	return `<section class="hero"><p class="eyebrow">Source-available · Bun · SQLite</p><h1>${SITE.name}</h1><p class="lead">${escapeHtml(SITE.tagline)}. It keeps downloading when no browser is open, remembers its work and resumes after a restart.</p><div class="hero-actions"><a class="gb-button gb-button-default gb-button-lg" href="${href(site, 'getting-started')}">Get started</a><a class="gb-button gb-button-outline gb-button-lg" href="${SITE.repo}" rel="noopener">View on GitHub</a></div></section><ul class="card-grid features">${cards}</ul><article class="doc">${site.home.html}</article>${sections}`
}

function missingBlock(site: Site): string {
	return `<article class="doc"><h1>Page not found</h1><p>This page does not exist, or it is not saved for offline use yet.</p><p><a href="${site.base}">Go to the documentation home</a></p></article>`
}

export function renderDocument(site: Site, view: View, options: DocumentOptions): string {
	const page = view.kind === 'page' ? view.page : null
	const meta: PageMeta =
		page !== null
			? { kind: 'article', path: page.path, title: page.heading, description: page.description, updated: page.updated, crumbs: [{ name: 'Documentation', path: '' }, { name: page.heading, path: page.path }] }
			: view.kind === 'home'
				? { kind: 'home', path: '', title: SITE.name, description: SITE.description, updated: site.home.updated, crumbs: [] }
				: { kind: 'missing', path: '404', title: 'Page not found', description: 'This page does not exist in the Wayfarer documentation.', updated: null, crumbs: [] }
	const main = page !== null ? articleBlock(site, page) : view.kind === 'home' ? homeBlock(site) : missingBlock(site)
	const headings = page !== null ? page.headings : view.kind === 'home' ? site.home.headings : []
	const base = site.base
	const navData = JSON.stringify(site.nav).replace(/</g, '\\u003c')
	return `<!doctype html>
<html lang="en" data-base="${escapeHtml(base)}">
<head>
${seoHead(meta, site.url, options.serviceWorker)}
<link rel="stylesheet" href="${base}assets/site.css">
<script>${THEME_SCRIPT}</script>
</head>
<body data-view="${view.kind === 'home' ? 'home' : 'doc'}">
<a class="skip" href="#content">Skip to content</a>
<header class="topbar"><div class="topbar-inner">
<a class="brand" href="${base}"><span class="brand-mark">${LOGO}</span><span class="brand-name">${SITE.name}</span><span class="brand-tag">Docs</span></a>
<nav class="top-links" aria-label="Primary"><a href="${href(site, 'getting-started')}">Guide</a><a href="${href(site, 'api/rest')}">API</a><a href="${SITE.repo}" rel="noopener">GitHub</a></nav>
<div id="island-actions" class="actions-slot"></div>
</div></header>
<div class="layout">
<nav id="sidebar" class="sidebar" aria-label="Documentation">${sidebarHtml(site, page?.path ?? '')}</nav>
<main id="content" tabindex="-1">${main}</main>
<aside id="toc" class="toc" aria-label="On this page">${tocHtml(headings)}</aside>
</div>
<footer class="footer">
<p>${SITE.name} is source-available under the <a href="${SITE.license}" rel="noopener">PolyForm Strict License 1.0.0</a>. It is not open-source software.</p>
<p><a href="${SITE.repo}" rel="noopener">GitHub</a> · <a href="${SITE.repo}/blob/${SITE.branch}/SECURITY.md" rel="noopener">Security policy</a> · <a href="${SITE.repo}/blob/${SITE.branch}/CHANGELOG.md" rel="noopener">Changelog</a></p>
</footer>
<div id="island-search"></div><div id="island-nav"></div><div id="island-status"></div>
<script type="application/json" id="nav-data">${navData}</script>
<script type="module" src="${base}assets/app.js"></script>
</body>
</html>
`
}
