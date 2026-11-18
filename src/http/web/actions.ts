import { redirect, text } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { DownloadNotFoundError } from '../../downloads/domain/errors'
import { InvalidDownloadError } from '../../downloads/domain/validation'
import type { AddDownloadInput } from '../../downloads/intake'
import { formatSpeed } from '../../ui/format'
import { isFilterName } from '../../ui/view-model'
import type { ApiRuntime } from '../api/context'
import { toApiError } from '../api/errors'
import { serveCompletedFile } from '../api/files'
import { tokensMatch } from '../middleware/security'
import { LoginThrottle } from './session'
import type { Session } from './session'
import type { SessionResolver } from './session-context'

const SPEED_UNITS: Readonly<Record<string, number>> = { kib: 1024, mib: 1024 * 1024 }
const INVALID_TOKEN_MESSAGE = 'Invalid or missing security token. Go back, reload the page and try again.'

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
	const filter = field(form, 'filter')
	return isFilterName(filter) && filter !== 'all' ? `/?filter=${filter}` : '/'
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
	async function perform(request: Request, work: (form: FormData) => Promise<string> | string): Promise<Response> {
		const { session } = sessions.resolve(request)
		if (!session.authenticated) return redirect('/login', 303)
		const form = await readForm(request)
		if (form === null || !csrfValid(session, form)) return text(INVALID_TOKEN_MESSAGE, { status: 403 })
		try { session.flash = { kind: 'success', message: await work(form) } } catch (error) { session.flash = { kind: 'error', message: describeFailure(error) } }
		return redirect(returnPath(form), 303)
	}

	app.post('/actions/add', (context) =>
		perform(context.request, async (form) => {
			const priorityText = field(form, 'priority')
			const checksum = field(form, 'sha256')
			const input: AddDownloadInput = { url: field(form, 'url'), ...(priorityText === '' ? {} : { priority: wholeNumber(form, 'priority', 'Priority') }), ...(checksum === '' ? {} : { expectedSha256: checksum }) }
			const record = await intake.add(input)
			return `Added “${record.filename}”`
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

	app.post('/actions/bandwidth', (context) =>
		perform(context.request, (form) => {
			const amount = Number(field(form, 'amount'))
			const unit = SPEED_UNITS[field(form, 'unit')]
			if (field(form, 'amount') === '' || !Number.isFinite(amount) || amount < 0 || unit === undefined) throw new InvalidDownloadError('Enter a speed of zero or more, and choose a unit')
			const bytesPerSecond = Math.round(amount * unit)
			runtime.setBandwidthLimit(bytesPerSecond)
			return bytesPerSecond === 0 ? 'Bandwidth limit removed' : `Bandwidth limited to ${formatSpeed(bytesPerSecond)}`
		})
	)

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
}
