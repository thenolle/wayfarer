import { posix } from 'node:path'
import { highlight } from './highlight'
import { decodeEntities, escapeHtml, slugify } from './text'
import type { Heading } from './types'

export interface RenderOptions {
	readonly docPath: string
	readonly base: string
	readonly pages: ReadonlySet<string>
	readonly repoBlob: string
}

export interface Rendered {
	readonly title: string
	readonly html: string
	readonly headings: Heading[]
	readonly text: string
}

const FENCE = /^```\s*([\w+-]*)\s*(?:title="([^"]*)")?\s*$/
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/
const LABELS: Readonly<Record<string, string>> = { note: 'Note', tip: 'Tip', warning: 'Warning', important: 'Important', caution: 'Caution' }

function plain(raw: string): string {
	return raw.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '').trim()
}

function cells(line: string): string[] {
	let text = line.trim()
	if (text.startsWith('|')) text = text.slice(1)
	if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
	return text.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function alignment(cell: string): string {
	const left = cell.startsWith(':')
	const right = cell.endsWith(':')
	return left && right ? 'center' : right ? 'right' : ''
}

function startsBlock(line: string, next: string): boolean {
	return (line.startsWith('```') && FENCE.test(line)) || HEADING.test(line) || RULE.test(line) || line.startsWith('>') || LIST.test(line) || (line.includes('|') && SEPARATOR.test(next))
}

function codeBlock(lang: string, title: string | null, code: string): string {
	const language = lang.toLowerCase()
	const label = title ?? (language === '' || language === 'text' ? '' : language)
	const caption = label === '' ? '' : `<figcaption>${escapeHtml(label)}</figcaption>`
	const attribute = language === '' ? '' : ` class="language-${escapeHtml(language)}"`
	return `<figure class="code">${caption}<button class="copy" type="button" data-copy hidden>Copy</button><pre tabindex="0"><code${attribute}>${highlight(code, language)}</code></pre></figure>`
}

class Renderer {
	title = ''
	readonly headings: Heading[] = []
	private readonly used = new Map<string, number>()

	constructor(private readonly options: RenderOptions) { }

	blocks(lines: readonly string[], tight = false): string {
		const out: string[] = []
		let i = 0
		while (i < lines.length) {
			const line = lines[i] ?? ''
			const next = lines[i + 1] ?? ''
			if (line.trim() === '') {
				i += 1
				continue
			}
			if (line.trimStart().startsWith('<!--')) {
				while (i < lines.length && !(lines[i] ?? '').includes('-->')) i += 1
				i += 1
				continue
			}
			const fence = line.startsWith('```') ? FENCE.exec(line) : null
			if (fence !== null) {
				const code: string[] = []
				i += 1
				while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
					code.push(lines[i] ?? '')
					i += 1
				}
				i += 1
				out.push(codeBlock(fence[1] ?? '', fence[2] ?? null, code.join('\n')))
				continue
			}
			const heading = HEADING.exec(line)
			if (heading !== null) {
				out.push(this.heading((heading[1] ?? '#').length, heading[2] ?? ''))
				i += 1
				continue
			}
			if (RULE.test(line)) {
				out.push('<hr>')
				i += 1
				continue
			}
			if (line.startsWith('>')) {
				const quote: string[] = []
				while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
					quote.push((lines[i] ?? '').replace(/^>\s?/, ''))
					i += 1
				}
				out.push(this.quote(quote))
				continue
			}
			if (line.includes('|') && SEPARATOR.test(next) && next.includes('-')) {
				const header = cells(line)
				const aligns = cells(next).map(alignment)
				const rows: string[][] = []
				i += 2
				while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim() !== '') {
					rows.push(cells(lines[i] ?? ''))
					i += 1
				}
				out.push(this.table(header, aligns, rows))
				continue
			}
			if (LIST.test(line)) {
				const result = this.list(lines, i)
				out.push(result.html)
				i = result.next
				continue
			}
			const paragraph: string[] = [line]
			i += 1
			while (i < lines.length && (lines[i] ?? '').trim() !== '' && !startsBlock(lines[i] ?? '', lines[i + 1] ?? '')) {
				paragraph.push(lines[i] ?? '')
				i += 1
			}
			const text = this.inline(paragraph.map((entry) => entry.trimStart()).join('\n').trim())
			out.push(tight ? text : `<p>${text}</p>`)
		}
		return out.join('')
	}

	private list(lines: readonly string[], start: number): { html: string; next: number } {
		const first = LIST.exec(lines[start] ?? '')
		const baseIndent = (first?.[1] ?? '').length
		const ordered = /^\d/.test(first?.[2] ?? '')
		const startNumber = ordered ? Number.parseInt(first?.[2] ?? '1', 10) : 1
		const items: { lines: string[]; indent: number }[] = []
		let i = start
		while (i < lines.length) {
			const line = lines[i] ?? ''
			const match = LIST.exec(line)
			if (match !== null && (match[1] ?? '').length === baseIndent) {
				items.push({ lines: [match[3] ?? ''], indent: baseIndent + (match[2] ?? '-').length + 1 })
				i += 1
				continue
			}
			const current = items.at(-1)
			if (current === undefined) break
			if (line.trim() === '') {
				let j = i + 1
				while (j < lines.length && (lines[j] ?? '').trim() === '') j += 1
				const following = lines[j] ?? ''
				if (j < lines.length && following.length - following.trimStart().length > baseIndent) {
					current.lines.push('')
					i += 1
					continue
				}
				break
			}
			const indent = line.length - line.trimStart().length
			const previous = lines[i - 1] ?? ''
			if (indent > baseIndent || (previous.trim() !== '' && !startsBlock(line, lines[i + 1] ?? ''))) {
				current.lines.push(line.replace(new RegExp(`^ {0,${current.indent}}`), ''))
				i += 1
				continue
			}
			break
		}
		const tag = ordered ? 'ol' : 'ul'
		const attribute = ordered && startNumber !== 1 ? ` start="${startNumber}"` : ''
		const html = items.map((item) => `<li>${this.blocks(item.lines, !item.lines.includes(''))}</li>`).join('')
		return { html: `<${tag}${attribute}>${html}</${tag}>`, next: i }
	}

	private table(header: string[], aligns: string[], rows: string[][]): string {
		const cell = (tag: string, text: string, index: number): string => {
			const align = aligns[index] ?? ''
			return `<${tag}${align === '' ? '' : ` class="align-${align}"`}>${this.inline(text)}</${tag}>`
		}
		const head = `<thead><tr>${header.map((text, index) => cell('th', text, index)).join('')}</tr></thead>`
		const body = `<tbody>${rows.map((row) => `<tr>${header.map((_label, index) => cell('td', row[index] ?? '', index)).join('')}</tr>`).join('')}</tbody>`
		return `<div class="table-wrap" tabindex="0"><table>${head}${body}</table></div>`
	}

	private quote(lines: string[]): string {
		const first = lines[0] ?? ''
		const alert = /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*$/i.exec(first)
		if (alert !== null) return this.callout((alert[1] ?? 'note').toLowerCase(), lines.slice(1))
		const labelled = /^\*\*(Note|Tip|Warning|Important|Caution):\*\*\s*(.*)$/i.exec(first)
		if (labelled !== null) return this.callout((labelled[1] ?? 'note').toLowerCase(), [labelled[2] ?? '', ...lines.slice(1)])
		return `<blockquote>${this.blocks(lines)}</blockquote>`
	}

	private callout(kind: string, lines: string[]): string {
		return `<aside class="callout callout-${kind}" role="note"><p class="callout-title">${LABELS[kind] ?? 'Note'}</p>${this.blocks(lines)}</aside>`
	}

	private heading(level: number, raw: string): string {
		const text = plain(raw)
		if (level === 1 && this.title === '') this.title = text
		const slug = slugify(text) || 'section'
		const count = this.used.get(slug) ?? 0
		this.used.set(slug, count + 1)
		const id = count === 0 ? slug : `${slug}-${count}`
		if (level === 2 || level === 3) this.headings.push({ level, id, text })
		const content = this.inline(raw)
		if (level === 1) return `<h1 id="${id}">${content}</h1>`
		return `<h${level} id="${id}">${content}<a class="anchor" href="#${id}" aria-label="Link to ${escapeHtml(text)}">#</a></h${level}>`
	}

	inline(source: string): string {
		const stash: string[] = []
		let text = source.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_match, _ticks: string, code: string) => {
			stash.push(`<code>${escapeHtml(code.trim())}</code>`)
			return `\u0000${stash.length - 1}\u0000`
		})
		text = escapeHtml(text)
		text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt: string, src: string) => `<img src="${escapeHtml(decodeEntities(src))}" alt="${alt}" loading="lazy" decoding="async">`)
		text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, label: string, href: string) => this.link(label, decodeEntities(href)))
		text = text.replace(/&lt;(https?:\/\/\S+?)&gt;/g, (_match, url: string) => this.link(url, decodeEntities(url)))
		text = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>').replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
		text = text.replace(/(?<![\w*])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?![\w*])/g, '<em>$1</em>').replace(/(?<![\w_])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\w_])/g, '<em>$1</em>')
		text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
		text = text.replace(/ {2,}\n/g, '<br>\n').replace(/\\\n/g, '<br>\n')
		return text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => stash[Number(index)] ?? '')
	}

	private href(raw: string): string {
		if (/^(?:https?:|mailto:)/i.test(raw)) return raw
		if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '#'
		if (raw.startsWith('#')) return raw
		const hashAt = raw.indexOf('#')
		const path = hashAt === -1 ? raw : raw.slice(0, hashAt)
		const hash = hashAt === -1 ? '' : raw.slice(hashAt)
		if (path === '') return hash === '' ? '#' : hash
		const repoPath = posix.normalize(posix.join('docs', posix.dirname(this.options.docPath), path))
		if (repoPath.startsWith('docs/') && repoPath.endsWith('.md')) {
			const page = repoPath.slice(5, -3)
			if (page === 'index') return `${this.options.base}${hash}`
			if (this.options.pages.has(page)) return `${this.options.base}${page}/${hash}`
		}
		return `${this.options.repoBlob}/${repoPath}${hash}`
	}

	private link(label: string, raw: string): string {
		const target = this.href(raw)
		const external = /^https?:/i.test(target)
		return `<a href="${escapeHtml(target)}"${external ? ' class="external" rel="noopener noreferrer"' : ''}>${label}</a>`
	}
}

export function renderMarkdown(source: string, options: RenderOptions): Rendered {
	const renderer = new Renderer(options)
	const html = renderer.blocks(source.replace(/\r\n?/g, '\n').split('\n'))
	const stripped = html.replace(/<a class="anchor"[^>]*>#<\/a>/g, '').replace(/<button[\s\S]*?<\/button>/g, ' ').replace(/<[^>]+>/g, ' ')
	const text = decodeEntities(stripped).replace(/\s+/g, ' ').trim()
	return { title: renderer.title, html, headings: renderer.headings, text }
}
