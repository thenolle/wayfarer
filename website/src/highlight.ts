import { escapeHtml } from './text'

interface Rule {
	readonly re: RegExp
	readonly cls: string
}

const KEYWORDS = 'abstract|as|async|await|break|case|catch|class|const|continue|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|private|protected|public|readonly|return|static|super|switch|this|throw|try|type|typeof|var|void|while|yield'
const STRING = /`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/y

const SCRIPT: readonly Rule[] = [
	{ re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y, cls: 'c' },
	{ re: STRING, cls: 's' },
	{ re: /\b(?:true|false|null|undefined)\b/y, cls: 'l' },
	{ re: new RegExp(`\\b(?:${KEYWORDS})\\b`, 'y'), cls: 'k' },
	{ re: /\b\d[\d_]*(?:\.\d+)?\b/y, cls: 'n' },
	{ re: /[A-Za-z_$][\w$]*(?=\()/y, cls: 'f' }
]

const JSON_RULES: readonly Rule[] = [
	{ re: /"(?:\\.|[^"\\\n])*"(?=\s*:)/y, cls: 'p' },
	{ re: /"(?:\\.|[^"\\\n])*"/y, cls: 's' },
	{ re: /\b(?:true|false|null)\b/y, cls: 'l' },
	{ re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y, cls: 'n' }
]

const SHELL: readonly Rule[] = [
	{ re: /#[^\n]*/y, cls: 'c' },
	{ re: /'[^'\n]*'|"(?:\\.|[^"\\\n])*"/y, cls: 's' },
	{ re: /\$\{[^}\n]*\}|\$[A-Za-z_]\w*/y, cls: 'v' },
	{ re: /(?<=\s)--?[A-Za-z][\w-]*/y, cls: 'f' }
]

const CONFIG: readonly Rule[] = [
	{ re: /#[^\n]*/y, cls: 'c' },
	{ re: /^[ \t]*[\w.-]+(?=[ \t]*[:=])/my, cls: 'p' },
	{ re: STRING, cls: 's' },
	{ re: /\b\d+(?:\.\d+)?\b/y, cls: 'n' },
	{ re: /\b(?:true|false|null)\b/y, cls: 'l' }
]

function alias(names: readonly string[], rules: readonly Rule[]): (readonly [string, readonly Rule[]])[] {
	return names.map((name) => [name, rules] as const)
}

const LANGUAGES = new Map<string, readonly Rule[]>([
	...alias(['ts', 'tsx', 'js', 'jsx', 'mjs', 'javascript', 'typescript'], SCRIPT),
	...alias(['json', 'jsonc'], JSON_RULES),
	...alias(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell'], SHELL),
	...alias(['yaml', 'yml', 'toml', 'ini', 'env', 'dotenv', 'properties'], CONFIG)
])

export function highlight(code: string, lang: string): string {
	const rules = LANGUAGES.get(lang)
	if (rules === undefined) return escapeHtml(code)
	let out = ''
	let i = 0
	while (i < code.length) {
		let matched = false
		for (const rule of rules) {
			rule.re.lastIndex = i
			const match = rule.re.exec(code)
			if (match !== null && match[0].length > 0) {
				out += `<span class="tok-${rule.cls}">${escapeHtml(match[0])}</span>`
				i += match[0].length
				matched = true
				break
			}
		}
		if (!matched) {
			out += escapeHtml(code.charAt(i))
			i += 1
		}
	}
	return out
}
