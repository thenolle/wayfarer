import { json } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { isDownloadStatus } from '../../downloads/domain/status'
import type { DownloadStatus } from '../../downloads/domain/status'
import { exportDownloads, importDownloads, parseImport } from '../../downloads/transfer'
import { readJsonObject } from './body'
import type { ApiRuntime } from './context'
import { ApiError } from './errors'

function parseStatuses(value: string | null): readonly DownloadStatus[] | null {
	if (value === null || value.trim() === '') return null
	const statuses: DownloadStatus[] = []
	for (const part of value.split(',')) {
		const status = part.trim()
		if (!isDownloadStatus(status)) throw new ApiError(400, 'invalid_request', `Unknown status "${status}"`)
		statuses.push(status)
	}
	return statuses
}

/**
 * Registers `GET /api/export` (optionally `?status=queued,paused`) and
 * `POST /api/import`. The export holds links, so it is only available to
 * authenticated callers like the rest of `/api`.
 */
export function registerTransferRoutes(app: App, runtime: ApiRuntime): void {
	app.get('/api/export', (context) => {
		const statuses = parseStatuses(context.url.searchParams.get('status'))
		const records = statuses === null ? runtime.downloads.list() : runtime.downloads.listByStatuses(statuses)
		return json({ data: exportDownloads(records, Date.now()) })
	})

	app.post('/api/import', async (context) => {
		const body = await readJsonObject(context.request)
		const allowDuplicate = body['allowDuplicate']
		if (allowDuplicate !== undefined && typeof allowDuplicate !== 'boolean') throw new ApiError(400, 'invalid_request', '"allowDuplicate" must be true or false')
		return json({ data: await importDownloads(runtime.intake, parseImport(body), { allowDuplicate: allowDuplicate === true }) })
	})
}
