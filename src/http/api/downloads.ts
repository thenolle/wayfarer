import { json } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { isDownloadStatus } from '../../downloads/domain/status'
import type { DownloadStatus } from '../../downloads/domain/status'
import type { AddDownloadInput } from '../../downloads/intake'
import { optionalInteger, optionalString, readJsonObject, requireString } from './body'
import type { ApiRuntime } from './context'
import { toPublicDownload } from './dto'
import { ApiError } from './errors'
import { serveCompletedFile } from './files'

function parseStatusFilter(value: string | null): readonly DownloadStatus[] | null {
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
 * Registers the download endpoints. Every success body is `{ "data": ... }`.
 */
export function registerDownloadRoutes(app: App, runtime: ApiRuntime): void {
	const { downloads, segments, scheduler, intake } = runtime

	app.get('/api/downloads', (context) => {
		const filter = parseStatusFilter(context.url.searchParams.get('status'))
		const records = filter === null ? downloads.list() : downloads.listByStatuses(filter)
		return json({ data: records.map((record) => toPublicDownload(record)) })
	})

	app.get('/api/downloads/:id', (context) => {
		const record = downloads.require(context.params.id)
		return json({ data: toPublicDownload(record, segments.list(record.id)) })
	})

	app.post('/api/downloads', async (context) => {
		const body = await readJsonObject(context.request)
		const priority = optionalInteger(body, 'priority')
		const sha256 = optionalString(body, 'sha256')
		const filename = optionalString(body, 'filename')
		const allowDuplicate = body['allowDuplicate']
		if (allowDuplicate !== undefined && typeof allowDuplicate !== 'boolean') throw new ApiError(400, 'invalid_request', '"allowDuplicate" must be true or false')
		const input: AddDownloadInput = { url: requireString(body, 'url'), ...(priority === undefined ? {} : { priority }), ...(sha256 === undefined ? {} : { expectedSha256: sha256 }), ...(filename === undefined ? {} : { filename }), ...(allowDuplicate === true ? { allowDuplicate: true } : {}) }
		const record = await intake.add(input)
		return json({ data: toPublicDownload(record) }, { status: 201, headers: { location: `/api/downloads/${record.id}` } })
	})

	app.post('/api/downloads/:id/pause', async (context) =>
		json({ data: toPublicDownload(await scheduler.pause(context.params.id)) })
	)

	app.post('/api/downloads/:id/resume', (context) => json({ data: toPublicDownload(scheduler.resume(context.params.id)) }))

	app.post('/api/downloads/:id/cancel', async (context) =>
		json({ data: toPublicDownload(await scheduler.cancel(context.params.id)) })
	)

	app.delete('/api/downloads/:id', async (context) => {
		const deleteFile = context.url.searchParams.get('deleteFile') === 'true'
		if (!(await scheduler.remove(context.params.id, { deleteFile }))) throw new ApiError(404, 'not_found', 'Download not found')
		return json({ data: { deleted: true } })
	})

	app.get('/api/downloads/:id/file', (context) => serveCompletedFile(runtime, context.params.id, context.request))
}
