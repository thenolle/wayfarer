import { ResolverError } from '../http/errors'
import { DEFAULT_USER_AGENT } from '../http/headers'
import type { ResolvedSource, UrlResolver } from './types'

const FILE_PATH = /^\/file\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/|$)/
const FOLDER_PATH = /^\/(?:drive\/)?folders\//
const ID = /^[\w-]{10,}$/

function valid(value: string | null | undefined): string | null {
	return value !== null && value !== undefined && ID.test(value) ? value : null
}

function fileId(url: URL): string | null {
	const host = url.hostname.toLowerCase()
	const parameter = url.searchParams.get('id')
	if (host === 'drive.google.com') return valid(FILE_PATH.exec(url.pathname)?.[1]) ?? (url.pathname === '/open' || url.pathname === '/uc' ? valid(parameter) : null)
	if (host === 'docs.google.com' && url.pathname === '/uc') return valid(parameter)
	return null
}

/**
 * Resolves public Google Drive file links to the download endpoint. Folders and
 * Google Docs exports are not supported. When Drive answers with a quota or
 * limit page, the probe refuses it; limits are never worked around.
 */
export class GoogleDriveResolver implements UrlResolver {
	readonly name = 'google-drive'

	canResolve(url: URL): boolean {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
		if (url.hostname.toLowerCase() === 'drive.google.com' && FOLDER_PATH.test(url.pathname)) return true
		return fileId(url) !== null
	}

	async resolve(url: URL): Promise<ResolvedSource> {
		if (FOLDER_PATH.test(url.pathname)) throw new ResolverError('Google Drive folders are not supported. Open the folder and add each file link.')
		const id = fileId(url)
		if (id === null) throw new ResolverError('That Google Drive link does not contain a file ID')
		const target = new URL('https://drive.usercontent.google.com/download')
		target.searchParams.set('id', id)
		target.searchParams.set('export', 'download')
		target.searchParams.set('confirm', 't')
		const resourceKey = url.searchParams.get('resourcekey')
		if (resourceKey !== null && resourceKey !== '') target.searchParams.set('resourcekey', resourceKey)
		return { resolver: this.name, url: target.href, headers: { 'User-Agent': DEFAULT_USER_AGENT }, filenameHint: null }
	}
}
