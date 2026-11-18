export const SITE = {
	name: 'Wayfarer',
	tagline: 'A persistent, cross-platform background download manager',
	description: 'Wayfarer is a background download manager built with Bun, TypeScript and SQLite. Learn how to install it, configure it, use its dashboard and REST API, and deploy it with Docker or as a system service.',
	repo: 'https://github.com/thenolle/wayfarer',
	branch: 'master',
	author: 'Nolly',
	authorUrl: 'https://github.com/thenolle',
	license: 'https://polyformproject.org/licenses/strict/1.0.0/',
	themeLight: '#b93168',
	themeDark: '#1a1316',
	defaultUrl: 'https://thenolle.github.io/wayfarer/'
} as const

export function siteUrl(value: string | undefined): URL {
	const raw = value === undefined || value === '' ? SITE.defaultUrl : value
	return new URL(raw.endsWith('/') ? raw : `${raw}/`)
}
