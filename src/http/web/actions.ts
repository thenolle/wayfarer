import { redirect, text } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { DownloadNotFoundError } from '../../downloads/domain/errors'
import { InvalidDownloadError } from '../../downloads/domain/validation'
import type { AddDownloadInput } from '../../downloads/intake'
import { formatSpeed } from '../../ui/format'
import { DEFAULT_SORT, isFilterName, isSortName, MAX_QUERY_LENGTH } from '../../ui/view-model'
import type { ApiRuntime } from '../api/context'
import { toApiError } from '../api/errors'
import { serveCompletedFile } from '../api/files'
import { tokensMatch } from '../middleware/security'
import { LoginThrottle } from './session'
import type { Session } from './session'
import type { SessionResolver } from './session-context'
import { isLoopbackHost } from '../../config/config'
import { BlockedDestinationError, HttpStatusError, ResolverError, UnsupportedUrlError } from '../../downloads/http/errors'
import { PathEscapeError } from '../../filesystem/errors'
import { confineToLocations } from '../../filesystem/locations'
import { revealInFileManager } from '../../filesystem/reveal'

const SPEED_UNITS: Readonly<Record<string, number>> = { kib: 1024, mib: 1024 * 1024 }
const INVALID_TOKEN_MESSAGE = 'Invalid or missing security token. Go back, reload the page and try again.'
const MAX_BATCH = 50
const MAX_BULK = 200
const MAX_PREVIEWS = 4

function previewMessage(error: unknown): string {
	if (error instanceof HttpStatusError || error instanceof ResolverError || error instanceof BlockedDestinationError || error instanceof UnsupportedUrlError || error instanceof InvalidDownloadError) return error.message
	if (error instanceof DOMException && error.name === 'TimeoutError') return 'The server took too long to answer'
	if (error instanceof TypeError) return 'The server could not be reached'
	return describeFailure(error)
}

async function readForm(request: Request): Promise<FormData | null> {
	try { return await request.formData() } catch { return null }
}

function field(form: FormData, name: string): string {
	const value = form.get(name)
	return typeof value === 'string' ? value.trim() : ''
}

function wholeNumber(form: FormData, name: string, label: string): number {
	const value = Number(field(form, name))
	if (field(form, name) === '' || !Number.isInteger(value)) throw new InvalidDownloadError(`${label} must be a whole number`)
	return value
}

function returnPath(form: FormData): string {
	const params = new URLSearchParams()
	const filter = field(form, 'filter')
	if (isFilterName(filter) && filter !== 'all') params.set('filter', filter)
	const q = field(form, 'q').slice(0, MAX_QUERY_LENGTH)
	if (q !== '') params.set('q', q)
	const sort = field(form, 'sort')
	if (isSortName(sort) && sort !== DEFAULT_SORT) params.set('sort', sort)
	const query = params.toString()
	return query === '' ? '/' : `/?${query}`
}

function csrfValid(session: Session, form: FormData): boolean {
	const token = form.get('csrf')
	return typeof token === 'string' && tokensMatch(token, session.csrfToken)
}

function describeFailure(error: unknown): string {
	const known = toApiError(error)
	if (known !== null) return known.message
	if (error instanceof RangeError) return error.message
	console.error('[wayfarer] action failed', error)
	return 'Something went wrong. Please try again.'
}

function plural(count: number): string {
	return `${count} ${count === 1 ? 'download' : 'downloads'}`
}

/**
 * Registers the dashboard's form endpoints, file download and sign-in.
 *
 * Every form action follows the same steps: find the session, require it to
 * be signed in, require a matching CSRF token, run the action, store a
 * success or error message for the next page, and redirect (303) back to the
 * dashboard. Nothing here needs JavaScript in the browser.
 */
export function registerWebRoutes(app: App, runtime: ApiRuntime, sessions: SessionResolver): void {
	const { scheduler, intake } = runtime
	const throttle = new LoginThrottle()
	const bulkActions = new Map<string, { run: (id: string) => Promise<unknown> | unknown; past: string }>([
		['pause', { run: (id) => scheduler.pause(id), past: 'Paused' }],
		['resume', { run: (id) => scheduler.resume(id), past: 'Resumed' }],
		['cancel', { run: (id) => scheduler.cancel(id), past: 'Cancelled' }],
		['remove', { run: (id) => scheduler.remove(id), past: 'Removed' }]
	])

	async function perform(request: Request, work: (form: FormData) => Promise<string> | string): Promise<Response> {
		const { session } = sessions.resolve(request)
		if (!session.authenticated) return redirect('/login', 303)
		const form = await readForm(request)
		if (form === null || !csrfValid(session, form)) return text(INVALID_TOKEN_MESSAGE, { status: 403 })
		try { session.flash = { kind: 'success', message: await work(form) } } catch (error) { session.flash = { kind: 'error', message: describeFailure(error) } }
		return redirect(returnPath(form), 303)
	}

	let previews = 0

	app.post('/actions/add', (context) =>
		perform(context.request, async (form) => {
			const urls = field(form, 'url').split(/\s+/).filter((entry) => entry !== '')
			if (urls.length === 0) throw new InvalidDownloadError('Enter at least one URL')
			if (urls.length > MAX_BATCH) throw new InvalidDownloadError(`Add at most ${MAX_BATCH} links at a time`)
			const priorityText = field(form, 'priority')
			const checksum = field(form, 'sha256')
			if (checksum !== '' && urls.length > 1) throw new InvalidDownloadError('A checksum can only be used when adding a single link')
			const filename = field(form, 'filename')
			if (filename !== '' && urls.length > 1) throw new InvalidDownloadError('A file name can only be set when adding a single link')
			const priority = priorityText === '' ? undefined : wholeNumber(form, 'priority', 'Priority')
			const added: string[] = []
			let failed = 0
			let firstError: unknown = null
			for (const url of urls) {
				const input: AddDownloadInput = {
					url,
					locationId: field(form, 'location'),
					subfolder: field(form, 'subfolder'),
					...(priority === undefined ? {} : { priority }),
					...(checksum === '' ? {} : { expectedSha256: checksum }),
					...(filename === '' ? {} : { filename })
				}
				try {
					added.push((await intake.add(input)).filename)
				} catch (error) {
					failed += 1
					firstError ??= error
				}
			}
			if (added.length === 0) throw firstError
			if (added.length === 1 && failed === 0) return `Added “${added[0] ?? 'download'}”`
			return failed === 0 ? `Added ${plural(added.length)}` : `Added ${plural(added.length)}, ${failed} skipped`
		})
	)

	app.post('/actions/bulk', (context) =>
		perform(context.request, async (form) => {
			const entry = bulkActions.get(field(form, 'action'))
			if (entry === undefined) throw new InvalidDownloadError('Choose an action')
			const ids = form.getAll('id').filter((value): value is string => typeof value === 'string')
			if (ids.length === 0) throw new InvalidDownloadError('Select at least one download first')
			if (ids.length > MAX_BULK) throw new InvalidDownloadError(`Select at most ${MAX_BULK} downloads`)
			let done = 0
			let skipped = 0
			for (const id of ids) {
				try {
					await entry.run(id)
					done += 1
				} catch {
					skipped += 1
				}
			}
			const message = `${entry.past} ${plural(done)}`
			return skipped === 0 ? message : `${message}, ${skipped} not applicable`
		})
	)

	app.post('/actions/downloads/:id/pause', (context) =>
		perform(context.request, async () => {
			await scheduler.pause(context.params.id)
			return 'Download paused'
		})
	)

	app.post('/actions/downloads/:id/resume', (context) =>
		perform(context.request, () => {
			scheduler.resume(context.params.id)
			return 'Download queued'
		})
	)

	app.post('/actions/downloads/:id/cancel', (context) =>
		perform(context.request, async () => {
			await scheduler.cancel(context.params.id)
			return 'Download cancelled'
		})
	)

	app.post('/actions/downloads/:id/delete', (context) =>
		perform(context.request, async () => {
			if (!(await scheduler.remove(context.params.id))) throw new DownloadNotFoundError(context.params.id)
			return 'Download removed from the list'
		})
	)

	app.post('/actions/downloads/:id/delete-file', (context) =>
		perform(context.request, async () => {
			if (!(await scheduler.remove(context.params.id, { deleteFile: true }))) throw new DownloadNotFoundError(context.params.id)
			return 'Download and file deleted'
		})
	)

	app.post('/actions/downloads/:id/priority', (context) =>
		perform(context.request, (form) => {
			scheduler.setPriority(context.params.id, wholeNumber(form, 'priority', 'Priority'))
			return 'Priority updated'
		})
	)

	app.post('/actions/bandwidth', (context) => perform(context.request, (form) => {
		const preset = field(form, 'preset')
		let bytesPerSecond: number
		if (preset !== '') {
			bytesPerSecond = Number(preset)
			if (!Number.isSafeInteger(bytesPerSecond) || bytesPerSecond < 0) throw new InvalidDownloadError('Enter a speed of zero or more, and choose a unit')
		} else {
			const amount = Number(field(form, 'amount'))
			const unit = SPEED_UNITS[field(form, 'unit')]
			if (field(form, 'amount') === '' || !Number.isFinite(amount) || amount < 0 || unit === undefined) throw new InvalidDownloadError('Enter a speed of zero or more, and choose a unit')
			bytesPerSecond = Math.round(amount * unit)
		}
		runtime.setBandwidthLimit(bytesPerSecond)
		return bytesPerSecond === 0 ? 'Bandwidth limit removed' : `Bandwidth limited to ${formatSpeed(bytesPerSecond)}`
	}))

	app.post('/actions/login', async (context) => {
		const { session } = sessions.resolve(context.request)
		const form = await readForm(context.request)
		if (form === null || !csrfValid(session, form)) return text(INVALID_TOKEN_MESSAGE, { status: 403 })
		const expected = runtime.config.authToken
		if (expected === null) return redirect('/', 303)
		if (throttle.blocked) {
			session.flash = { kind: 'error', message: 'Too many attempts. Wait a minute and try again.' }
			return redirect('/login', 303)
		}
		if (tokensMatch(field(form, 'token'), expected)) {
			throttle.reset()
			sessions.store.destroy(session.id)
			sessions.replace(context.request, sessions.store.create(true))
			return redirect('/', 303)
		}
		throttle.recordFailure()
		session.flash = { kind: 'error', message: 'That access token is not correct.' }
		return redirect('/login', 303)
	})

	app.post('/actions/logout', async (context) => {
		const { session } = sessions.resolve(context.request)
		const form = await readForm(context.request)
		if (form === null || !csrfValid(session, form)) return text(INVALID_TOKEN_MESSAGE, { status: 403 })
		sessions.store.destroy(session.id)
		return redirect('/login', 303)
	})

	app.get('/files/:id', (context) => {
		const { session } = sessions.resolve(context.request)
		if (!session.authenticated) return redirect('/login', 303)
		return serveCompletedFile(runtime, context.params.id, context.request)
	})

	app.post('/actions/preview', async (context) => {
		const { session } = sessions.resolve(context.request)
		if (!session.authenticated) return Response.json({ error: 'Sign in first' }, { status: 401 })
		const form = await readForm(context.request)
		if (form === null || !csrfValid(session, form)) return Response.json({ error: INVALID_TOKEN_MESSAGE }, { status: 403 })
		if (previews >= MAX_PREVIEWS) return Response.json({ error: 'Too many checks at once. Try again in a moment.' }, { status: 429 })
		previews += 1
		try {
			return Response.json({ data: await runtime.inspect(field(form, 'url')) })
		} catch (error) {
			return Response.json({ error: previewMessage(error) }, { status: 422 })
		} finally {
			previews -= 1
		}
	})

	app.post('/actions/downloads/:id/reveal', (context) => perform(context.request, async () => {
		if (!isLoopbackHost(runtime.config.host)) throw new InvalidDownloadError('Opening folders only works when Wayfarer runs on this computer')
		const record = runtime.downloads.get(context.params.id)
		if (record === null) throw new DownloadNotFoundError(context.params.id)
		let path: string
		try {
			path = confineToLocations(runtime.config.locations, record.destination)
		} catch (error) {
			if (error instanceof PathEscapeError) throw new InvalidDownloadError('That file is outside the download folders')
			throw error
		}
		const complete = record.status === 'completed'
		if (complete && !(await Bun.file(path).exists())) throw new InvalidDownloadError('The file is no longer there')
		if (!revealInFileManager(path, complete)) throw new InvalidDownloadError('No file manager could be opened on this system')
		return 'Opened the folder'
	}))
}
