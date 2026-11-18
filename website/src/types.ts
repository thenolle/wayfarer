export interface Heading {
	readonly level: number
	readonly id: string
	readonly text: string
}

export interface PageData {
	readonly path: string
	readonly title: string
	readonly description: string
	readonly html: string
	readonly headings: readonly Heading[]
	readonly updated: string | null
}

export interface SearchEntry {
	readonly path: string
	readonly title: string
	readonly section: string
	readonly description: string
	readonly headings: readonly string[]
	readonly text: string
}
