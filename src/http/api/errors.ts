import { json } from '@gambrel/core'
import { DownloadNotFoundError, InvalidTransitionError } from '../../downloads/domain/errors'
import { InvalidDownloadError } from '../../downloads/domain/validation'
import { ShuttingDownError } from '../../downloads/intake'
import { LocationError } from '../../filesystem/locations'
import { LocationInUseError } from '../../filesystem/location-store'

/**
 * An error with an HTTP status and a stable machine-readable code. Its message
 * is safe to show to API clients.
 */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message)
		this.name = 'ApiError'
	}
}

/**
 * Builds the standard error body: `{ "error": { "code": "...", "message": "..." } }`.
 */
export function errorResponse(status: number, code: string, message: string, headers?: HeadersInit): Response {
	return json({ error: { code, message } }, { status, ...(headers === undefined ? {} : { headers }) })
}

/**
 * Maps domain errors to API errors. Returns null for anything unexpected.
 */
export function toApiError(error: unknown): ApiError | null {
	if (error instanceof ApiError) return error
	if (error instanceof DownloadNotFoundError) return new ApiError(404, 'not_found', 'Download not found')
	if (error instanceof InvalidTransitionError) return new ApiError(409, 'invalid_state', `A download that is ${error.from} cannot become ${error.to}`)
	if (error instanceof LocationInUseError) return new ApiError(409, 'location_in_use', error.message)
	if (error instanceof LocationError) return new ApiError(400, 'invalid_request', error.message)
	if (error instanceof InvalidDownloadError) return new ApiError(400, 'invalid_request', error.message)
	if (error instanceof ShuttingDownError) return new ApiError(503, 'shutting_down', error.message)
	return null
}

/**
 * Turns any thrown value into a response. Unexpected errors are logged on the
 * server and reported to clients without details.
 */
export function handleError(error: unknown): Response {
	const known = toApiError(error)
	if (known !== null) return errorResponse(known.status, known.code, known.message)
	console.error('[wayfarer] request failed', error)
	return errorResponse(500, 'internal_error', 'Internal server error')
}
