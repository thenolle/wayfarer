import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { renderMarkdown } from './markdown'
import { flatten, parseNav } from './nav'
import type { Nav, NavPage } from './nav'
import { SITE } from './site'
import { decodeEntities, truncate } from './text'
import type { Heading, SearchEntry } from './types'

export interface Page extends NavPage {
	readonly section: string
	readonly heading: string
	readonly html: string
	readonly headings: readonly Heading[]
	readonly text: string
	readonly description: string
	readonly updated: string | null
}

export interface Home {
	readonly html: string
	readonly headings: readonly Heading[]
	readonly text: string
	readonly updated: string | null
}

export interface Site {
	readonly url: URL
	readonly base: string
	readonly nav: Nav
	readonly pages: readonly Page[]
	readonly home: Home
}

function descriptionOf(html: string): string {
	const paragraph = /<p>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
	return decodeEntities(paragraph.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

async function modified(file: string, git: boolean): Promise<string | null> {
	if (git) {
		try {
			const child = Bun.spawn(['git', 'log', '-1', '--format=%cI', '--', file], { cwd: dirname(file), stdout: 'pipe', stderr: 'ignore' })
			const output = (await new Response(child.stdout).text()).trim()
			if (output !== '') return output
		} catch {
			return (await stat(file)).mtime.toISOString()
		}
	}
	return (await stat(file)).mtime.toISOString()
}

/**
 * Reads docs/nav.json and every Markdown file it lists, and renders them.
 * Fails when a listed page is missing; warns about Markdown files that are
 * not listed.
 */
export async function loadSite(docs: string, url: URL, options: { readonly git: boolean }): Promise<Site> {
	const nav = parseNav(JSON.parse(await readFile(join(docs, 'nav.json'), 'utf8')) as unknown)
	const known = new Set(flatten(nav).map((page) => page.path))
	const base = url.pathname
	const render = (docPath: string, source: string) => renderMarkdown(source, { docPath, base, pages: known, repoBlob: `${SITE.repo}/blob/${SITE.branch}` })
	const pages: Page[] = []
	const missing: string[] = []
	for (const section of nav.sections) {
		for (const entry of section.pages) {
			const file = join(docs, `${entry.path}.md`)
			let source: string
			try {
				source = await readFile(file, 'utf8')
			} catch {
				missing.push(`${entry.path}.md`)
				continue
			}
			const rendered = render(entry.path, source)
			pages.push({
				...entry,
				section: section.title,
				heading: rendered.title || entry.title,
				html: rendered.html,
				headings: rendered.headings,
				text: rendered.text,
				description: truncate(entry.summary !== '' ? entry.summary : descriptionOf(rendered.html), 158),
				updated: await modified(file, options.git)
			})
		}
	}
	if (missing.length > 0) throw new Error(`nav.json lists pages without a Markdown file: ${missing.join(', ')}`)
	const indexFile = join(docs, 'index.md')
	const home = render('index', await readFile(indexFile, 'utf8'))
	const listed = new Set([...known].map((path) => `${path}.md`).concat('index.md'))
	for (const file of await readdir(docs, { recursive: true })) {
		const name = String(file).replaceAll('\\', '/')
		if (name.endsWith('.md') && !listed.has(name)) console.warn(`[website] ${name} is not listed in docs/nav.json and will not be published`)
	}
	return { url, base, nav, pages, home: { html: home.html, headings: home.headings, text: home.text, updated: await modified(indexFile, options.git) } }
}

export function buildSearchIndex(site: Site): SearchEntry[] {
	return site.pages.map((page) => ({
		path: page.path,
		title: page.heading,
		section: page.section,
		description: page.description,
		headings: page.headings.map((heading) => heading.text),
		text: page.text.slice(0, 6000)
	}))
}
