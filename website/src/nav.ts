export interface NavPage {
	readonly path: string
	readonly title: string
	readonly summary: string
}

export interface NavSection {
	readonly title: string
	readonly pages: readonly NavPage[]
}

export interface Nav {
	readonly sections: readonly NavSection[]
}

export function parseNav(data: unknown): Nav {
	const root = data as { sections?: unknown } | null
	if (typeof root !== 'object' || root === null || !Array.isArray(root.sections)) throw new Error('nav.json needs a "sections" array')
	const seen = new Set<string>()
	const sections = (root.sections as unknown[]).map((rawSection): NavSection => {
		const section = rawSection as Record<string, unknown>
		if (typeof section['title'] !== 'string' || !Array.isArray(section['pages'])) throw new Error('Each nav section needs a title and pages')
		const pages = (section['pages'] as unknown[]).map((rawPage): NavPage => {
			const page = rawPage as Record<string, unknown>
			const path = page['path']
			const title = page['title']
			if (typeof path !== 'string' || !/^[a-z0-9][a-z0-9/-]*$/.test(path) || typeof title !== 'string') throw new Error(`Invalid nav page: ${JSON.stringify(rawPage)}`)
			if (seen.has(path)) throw new Error(`Duplicate nav path: ${path}`)
			seen.add(path)
			return { path, title, summary: typeof page['summary'] === 'string' ? page['summary'] : '' }
		})
		return { title: section['title'], pages }
	})
	return { sections }
}

export function flatten(nav: Nav): NavPage[] {
	return nav.sections.flatMap((section) => [...section.pages])
}
