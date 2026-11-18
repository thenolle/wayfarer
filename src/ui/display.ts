// src/ui/display.ts
export type FileKind = 'archive' | 'video' | 'audio' | 'image' | 'code' | 'document' | 'package' | 'file'

const KINDS: readonly (readonly [FileKind, readonly string[]])[] = [
	['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst']],
	['video', ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv', 'm4v']],
	['audio', ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus']],
	['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']],
	['code', ['js', 'ts', 'json', 'py', 'java', 'rs', 'go', 'c', 'cpp', 'html', 'css', 'xml', 'yml', 'yaml']],
	['document', ['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'epub', 'csv']],
	['package', ['iso', 'exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'apk']]
]

/**
 * The kind of file a name suggests, from its extension.
 */
export function fileKindOf(filename: string): FileKind {
	const dot = filename.lastIndexOf('.')
	if (dot < 0) return 'file'
	const extension = filename.slice(dot + 1).toLowerCase()
	for (const [kind, extensions] of KINDS) {
		if (extensions.includes(extension)) return kind
	}
	return 'file'
}

/**
 * The host name of a URL without a leading `www.`, or an empty string.
 */
export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return ''
	}
}
