import { describe, expect, test } from 'bun:test'
import { renderMarkdown } from '../src/markdown'

const options = {
	docPath: 'api/rest',
	base: '/wayfarer/',
	pages: new Set(['api/rest', 'architecture/overview', 'getting-started']),
	repoBlob: 'https://github.com/thenolle/wayfarer/blob/master'
}
const render = (source: string) => renderMarkdown(source, options)

describe('renderMarkdown', () => {
	test('uses the first heading as the title and lists h2 and h3 in the table of contents', () => {
		const result = render('# REST API\n\n## Examples\n\n### Add\n\n#### Deep\n\n## Examples')
		expect(result.title).toBe('REST API')
		expect(result.headings.map((heading) => heading.id)).toEqual(['examples', 'add', 'examples-1'])
	})

	test('rewrites links between pages, and to files outside docs', () => {
		const html = render('[a](../architecture/overview.md#rules) [b](../../README.md) [c](https://example.com)').html
		expect(html).toContain('href="/wayfarer/architecture/overview/#rules"')
		expect(html).toContain('href="https://github.com/thenolle/wayfarer/blob/master/README.md"')
		expect(html).toContain('rel="noopener noreferrer"')
	})

	test('escapes raw HTML and keeps code literal', () => {
		const html = render('<script>x</script> and `<b>`').html
		expect(html).not.toContain('<script>')
		expect(html).toContain('<code>&lt;b&gt;</code>')
	})

	test('renders tables, nested lists and callouts', () => {
		const html = render('| A | B |\n| --- | ---: |\n| 1 | 2 |\n\n- one\n  - nested\n- two\n\n> [!NOTE]\n> Careful').html
		expect(html).toContain('<th class="align-right">B</th>')
		expect(html).toContain('<li>one<ul><li>nested</li></ul></li>')
		expect(html).toContain('callout-note')
	})

	test('highlights fenced code and keeps the title', () => {
		const html = render('```ts title="x.ts"\nconst a = 1\n```').html
		expect(html).toContain('<figcaption>x.ts</figcaption>')
		expect(html).toContain('<span class="tok-k">const</span>')
	})

	test('extracts plain text for search without markup or anchors', () => {
		const result = render('# Title\n\n## Part\n\nSome **bold** text.')
		expect(result.text).toBe('Title Part Some bold text.')
	})
})
