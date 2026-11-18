export function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function decodeEntities(value: string): string {
	return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
}

export function slugify(value: string): string {
	return value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
}

export function truncate(value: string, max: number): string {
	if (value.length <= max) return value
	const cut = value.slice(0, max - 1)
	const space = cut.lastIndexOf(' ')
	return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}
