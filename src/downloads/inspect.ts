import { sanitizeFilename } from '../filesystem/filename'
import { probeSource } from './engine/probe'
import { filenameFromUrl } from './http/content-disposition'
import type { GuardedFetch } from './http/guarded-fetch'
import { parseDownloadUrl } from './intake'
import type { ResolverRegistry } from './resolvers/registry'

export interface LinkPreview {
	readonly filename: string
	readonly totalBytes: number | null
	readonly acceptsRanges: boolean
	readonly resolver: string
}

export interface InspectDependencies {
	readonly resolvers: ResolverRegistry
	readonly fetch: GuardedFetch
	readonly timeoutMs: number
}

/**
 * Finds out what a link points to without downloading it: runs the same
 * resolver and probe as a real download, then stops. Uses the guarded fetch,
 * so the network policy applies exactly as it does for downloads.
 */
export async function inspectLink(text: string, deps: InspectDependencies): Promise<LinkPreview> {
	const url = parseDownloadUrl(text)
	const context = { fetch: deps.fetch, signal: AbortSignal.timeout(deps.timeoutMs * 2) }
	const source = await deps.resolvers.resolve(url, context)
	const probe = await probeSource(source, context)
	return {
		filename: sanitizeFilename(probe.filename ?? filenameFromUrl(url) ?? 'download'),
		totalBytes: probe.totalBytes,
		acceptsRanges: probe.acceptsRanges,
		resolver: source.resolver
	}
}
