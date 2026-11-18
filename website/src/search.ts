import type { SearchEntry } from './types'

export interface SearchHit {
	readonly entry: SearchEntry
	readonly score: number
	readonly snippet: string
}

function snippetOf(text: string, tokens: readonly string[]): string {
	const lower = text.toLowerCase()
	const positions = tokens.map((token) => lower.indexOf(token)).filter((position) => position >= 0)
	if (positions.length === 0) return text.slice(0, 110)
	const start = Math.max(0, Math.min(...positions) - 40)
	return `${start > 0 ? '…' : ''}${text.slice(start, start + 120).trim()}${start + 120 < text.length ? '…' : ''}`
}

export function search(entries: readonly SearchEntry[], query: string): SearchHit[] {
	const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== '')
	if (tokens.length === 0) return []
	const hits: SearchHit[] = []
	for (const entry of entries) {
		const title = entry.title.toLowerCase()
		const headings = entry.headings.join(' ').toLowerCase()
		const description = entry.description.toLowerCase()
		const text = entry.text.toLowerCase()
		let score = 0
		let matched = true
		for (const token of tokens) {
			let points = 0
			if (title.includes(token)) points += title.startsWith(token) ? 15 : 10
			if (headings.includes(token)) points += 5
			if (description.includes(token)) points += 3
			if (text.includes(token)) points += 1
			if (points === 0) {
				matched = false
				break
			}
			score += points
		}
		if (matched) hits.push({ entry, score, snippet: snippetOf(entry.text, tokens) })
	}
	return hits.sort((a, b) => b.score - a.score).slice(0, 8)
}
