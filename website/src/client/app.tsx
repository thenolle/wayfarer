/** @jsxImportSource @gambrel/view */
import { mount } from '@gambrel/browser'
import { Button, Dialog, Kbd, Sheet } from '@gambrel/components'
import { Menu, Moon, Search, Sun } from '@gambrel/icons'
import { effect, signal } from '@gambrel/reactivity'
import type { Child, ViewEvent } from '@gambrel/view'
import { search } from '../search'
import type { SearchHit } from '../search'
import type { SearchEntry } from '../types'
import { announcement, base, go, headings, installNavigation, nav, navOpen, online, route, searchOpen, theme, toggleTheme, updateReady } from './state'
import { registerWorker } from './worker'

let indexPromise: Promise<SearchEntry[]> | null = null

function loadIndex(): Promise<SearchEntry[]> {
	indexPromise ??= fetch(`${base}search-index.json`)
		.then((response) => {
			if (!response.ok) throw new Error(String(response.status))
			return response.json() as Promise<SearchEntry[]>
		})
		.catch((error: unknown) => {
			indexPromise = null
			throw error
		})
	return indexPromise
}

function SidebarList(): Child {
	return (
		<div class="nav-tree">
			{nav.sections.map((section) => (
				<section class="nav-section">
					<h2>{section.title}</h2>
					<ul>
						{section.pages.map((page) => (
							<li>
								<a href={`${base}${page.path}/`} aria-current={() => (route() === page.path ? 'page' : null)}>
									{page.title}
								</a>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	)
}

function Toc(): Child {
	const active = signal('')
	effect(() => {
		const list = headings()
		const observer = new IntersectionObserver(
			(entries) => {
				const first = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
				if (first !== undefined) active.set(first.target.id)
			},
			{ rootMargin: '-80px 0px -70% 0px' }
		)
		for (const heading of list) {
			const element = document.getElementById(heading.id)
			if (element !== null) observer.observe(element)
		}
		return () => observer.disconnect()
	})
	return (
		<div class="toc-inner">
			{() =>
				headings().length === 0 ? null : (
					<>
						<h2>On this page</h2>
						<ul>
							{headings().map((heading) => (
								<li class={`lvl-${heading.level}`}>
									<a href={`#${heading.id}`} aria-current={() => (active() === heading.id ? 'true' : null)}>
										{heading.text}
									</a>
								</li>
							))}
						</ul>
					</>
				)
			}
		</div>
	)
}

function Actions(): Child {
	return (
		<div class="actions">
			<Button variant="outline" class="search-trigger" aria-label="Search the documentation" onClick={() => searchOpen.set(true)}>
				<Search size={16} />
				<span class="search-label">Search</span>
				<Kbd>Ctrl K</Kbd>
			</Button>
			<Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
				{() => (theme() === 'dark' ? <Sun size={18} /> : <Moon size={18} />)}
			</Button>
			<Button variant="ghost" size="icon" class="menu-button" aria-label="Open navigation" onClick={() => navOpen.set(true)}>
				<Menu size={18} />
			</Button>
		</div>
	)
}

function SearchDialog(): Child {
	const query = signal('')
	const hits = signal<SearchHit[]>([])
	const selected = signal(0)
	const failed = signal(false)
	let input: HTMLInputElement | null = null

	effect(() => {
		const text = query()
		if (!searchOpen()) return
		void loadIndex().then(
			(entries) => {
				if (text !== query.peek()) return
				failed.set(false)
				hits.set(search(entries, text))
				selected.set(0)
			},
			() => failed.set(true)
		)
	})

	effect(() => {
		if (searchOpen()) window.setTimeout(() => input?.focus(), 40)
	})

	const onKeyDown = (event: ViewEvent): void => {
		const key = (event as unknown as KeyboardEvent).key
		const count = hits.peek().length
		if (key === 'ArrowDown') {
			event.preventDefault()
			selected.set(Math.max(0, Math.min(count - 1, selected.peek() + 1)))
		} else if (key === 'ArrowUp') {
			event.preventDefault()
			selected.set(Math.max(0, selected.peek() - 1))
		} else if (key === 'Enter') {
			const hit = hits.peek()[selected.peek()]
			if (hit !== undefined) {
				event.preventDefault()
				searchOpen.set(false)
				void go(hit.entry.path, true)
			}
		}
	}

	return (
		<Dialog
			id="search-dialog"
			class="search-dialog"
			title="Search the documentation"
			description="Type to search, use the arrow keys to choose and press Enter to open."
			open={searchOpen}
			onOpenChange={(value: boolean) => searchOpen.set(value)}
		>
			<input
				class="gb-input search-input"
				type="search"
				placeholder="Search…"
				autocomplete="off"
				spellcheck={false}
				aria-label="Search the documentation"
				ref={(element: Element) => {
					input = element as HTMLInputElement
				}}
				onInput={(event: ViewEvent) => query.set((event.currentTarget as unknown as HTMLInputElement).value)}
				onKeyDown={onKeyDown}
			/>
			<ul class="results" role="listbox" aria-label="Results">
				{() =>
					hits().map((hit, index) => (
						<li role="option" aria-selected={() => String(selected() === index)}>
							<a href={`${base}${hit.entry.path}/`} onClick={() => searchOpen.set(false)}>
								<span class="result-title">{hit.entry.title}</span>
								<span class="result-section">{hit.entry.section}</span>
								<span class="result-snippet">{hit.snippet}</span>
							</a>
						</li>
					))
				}
			</ul>
			{() => (failed() ? <p class="empty">The search index could not be loaded.</p> : query() !== '' && hits().length === 0 ? <p class="empty">No pages match “{query()}”.</p> : null)}
		</Dialog>
	)
}

function MobileNav(): Child {
	return (
		<Sheet id="nav-sheet" side="left" title="Documentation" open={navOpen} onOpenChange={(value: boolean) => navOpen.set(value)}>
			<SidebarList />
		</Sheet>
	)
}

function Status(): Child {
	return (
		<div class="status-bar">
			<p class="sr-only" role="status" aria-live="polite">{announcement}</p>
			{() => (online() ? null : <p class="badge-offline" role="status">Offline · showing saved pages</p>)}
			{() =>
				updateReady() === null ? null : (
					<div class="toast" role="alert">
						<span>A new version of the docs is ready.</span>
						<Button size="sm" onClick={() => updateReady.peek()?.()}>Reload</Button>
					</div>
				)
			}
		</div>
	)
}

function boot(): void {
	document.documentElement.classList.add('js')
	const islands: readonly (readonly [string, Child])[] = [
		['sidebar', <SidebarList />],
		['toc', <Toc />],
		['island-actions', <Actions />],
		['island-search', <SearchDialog />],
		['island-nav', <MobileNav />],
		['island-status', <Status />]
	]
	for (const [id, view] of islands) {
		const element = document.getElementById(id)
		if (element !== null) mount(element, view)
	}

	effect(() => {
		route()
		searchOpen.set(false)
		navOpen.set(false)
	})

	installNavigation()

	document.addEventListener('keydown', (event) => {
		const target = event.target as HTMLElement | null
		const typing = target !== null && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		if ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey)) {
			event.preventDefault()
			searchOpen.set(true)
		} else if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey) {
			event.preventDefault()
			searchOpen.set(true)
		}
	})

	document.addEventListener('click', (event) => {
		const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-copy]')
		if (button === null || button === undefined) return
		const code = button.parentElement?.querySelector('pre code')?.textContent ?? ''
		void navigator.clipboard.writeText(code).then(() => {
			button.textContent = 'Copied'
			window.setTimeout(() => {
				button.textContent = 'Copy'
			}, 1500)
		})
	})

	window.addEventListener('online', () => online.set(true))
	window.addEventListener('offline', () => online.set(false))

	if (document.querySelector('meta[name="wayfarer:sw"]') !== null) void registerWorker(base, (apply) => updateReady.set(apply))
}

boot()
