import { signal } from '@gambrel/reactivity'
import { flatten } from '../nav'
import type { Nav } from '../nav'
import type { Heading, PageData } from '../types'

const THEME_KEY = 'wayfarer-docs-theme'

export const base = document.documentElement.dataset['base'] ?? '/'
export const nav: Nav = JSON.parse(document.getElementById('nav-data')?.textContent ?? '{"sections":[]}') as Nav
const known = new Set(flatten(nav).map((page) => page.path))

export function pathOf(url: URL): string | null {
	if (!url.pathname.startsWith(base)) return null
	return url.pathname.slice(base.length).replace(/index\.html$/, '').replace(/\/+$/, '')
}

function readHeadings(): Heading[] {
	return [...document.querySelectorAll<HTMLElement>('#content h2[id], #content h3[id]')].map((element) => {
		const clone = element.cloneNode(true) as HTMLElement
		clone.querySelector('.anchor')?.remove()
		return { level: Number(element.tagName.slice(1)), id: element.id, text: clone.textContent ?? '' }
	})
}

export const route = signal(pathOf(new URL(location.href)) ?? '')
export const headings = signal<Heading[]>(readHeadings())
export const searchOpen = signal(false)
export const navOpen = signal(false)
export const online = signal(navigator.onLine)
export const announcement = signal('')
export const updateReady = signal<(() => void) | null>(null)
export const theme = signal<'light' | 'dark'>(document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light')

export function toggleTheme(): void {
	const next = theme.peek() === 'dark' ? 'light' : 'dark'
	theme.set(next)
	document.documentElement.dataset['theme'] = next
	try {
		localStorage.setItem(THEME_KEY, next)
	} catch {
		return
	}
}

const cache = new Map<string, Promise<PageData>>()

export function fetchPage(path: string): Promise<PageData> {
	let entry = cache.get(path)
	if (entry === undefined) {
		entry = fetch(`${base}content/${path}.json`).then((response) => {
			if (!response.ok) throw new Error(String(response.status))
			return response.json() as Promise<PageData>
		})
		entry.catch(() => cache.delete(path))
		cache.set(path, entry)
	}
	return entry
}

function setContent(selector: string, value: string): void {
	document.querySelector(selector)?.setAttribute('content', value)
}

function apply(data: PageData, target: string): void {
	const content = document.getElementById('content')
	if (content === null) throw new Error('The page has no content area')
	content.innerHTML = data.html
	document.body.dataset['view'] = 'doc'
	document.title = `${data.title} · Wayfarer`
	setContent('meta[name="description"]', data.description)
	setContent('meta[property="og:title"]', document.title)
	setContent('meta[property="og:description"]', data.description)
	setContent('meta[name="twitter:title"]', document.title)
	setContent('meta[name="twitter:description"]', data.description)
	const canonical = new URL(target, location.origin).href
	setContent('meta[property="og:url"]', canonical)
	document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
}

function scrollAfter(hash: string): void {
	const content = document.getElementById('content')
	const element = hash === '' ? null : document.getElementById(decodeURIComponent(hash.slice(1)))
	if (element !== null) element.scrollIntoView()
	else window.scrollTo({ top: 0 })
	content?.focus({ preventScroll: true })
}

export async function go(path: string, push: boolean, hash = ''): Promise<void> {
	const target = `${base}${path}/${hash}`
	try {
		const data = await fetchPage(path)
		apply(data, target)
		if (push) history.pushState({ path }, '', target)
		route.set(path)
		headings.set([...data.headings])
		announcement.set(`${data.title} loaded`)
		scrollAfter(hash)
	} catch {
		location.assign(target)
	}
}

export function installNavigation(): void {
	document.addEventListener('click', (event) => {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		const anchor = (event.target as Element | null)?.closest('a')
		if (anchor === null || anchor === undefined || anchor.target !== '' || anchor.hasAttribute('download')) return
		const url = new URL(anchor.href, location.href)
		if (url.origin !== location.origin) return
		const path = pathOf(url)
		if (path === null || path === '' || !known.has(path)) return
		if (path === route.peek() && url.hash !== '') return
		event.preventDefault()
		if (path === route.peek()) scrollAfter('')
		else void go(path, true, url.hash)
	})

	const prefetch = (event: Event): void => {
		const anchor = (event.target as Element | null)?.closest?.('a')
		if (anchor === null || anchor === undefined) return
		const url = new URL(anchor.href, location.href)
		const path = url.origin === location.origin ? pathOf(url) : null
		if (path !== null && path !== '' && known.has(path)) fetchPage(path).catch(() => undefined)
	}
	document.addEventListener('pointerover', prefetch)
	document.addEventListener('focusin', prefetch)

	window.addEventListener('popstate', () => {
		const path = pathOf(new URL(location.href))
		if (path === null || path === '' || !known.has(path)) {
			location.reload()
			return
		}
		if (path === route.peek()) scrollAfter(location.hash)
		else void go(path, false, location.hash)
	})
}
