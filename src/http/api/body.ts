import { ApiError } from './errors'

export const MAX_JSON_BYTES = 64 * 1024

function invalid(message: string): ApiError {
	return new ApiError(400, 'invalid_request', message)
}

/**
 * Reads a JSON object from a request body.
 *
 * Requires `Content-Type: application/json` and limits the body to
 * `maxBytes`, counting bytes as they arrive so oversized bodies are never
 * held in memory.
 *
 * @throws {ApiError} 415, 413 or 400 when the body is unacceptable.
 */
export async function readJsonObject(request: Request, maxBytes: number = MAX_JSON_BYTES): Promise<Record<string, unknown>> {
	const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
	if (type !== 'application/json') throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json')
	const declared = Number(request.headers.get('content-length') ?? '0')
	if (Number.isFinite(declared) && declared > maxBytes) throw new ApiError(413, 'payload_too_large', `The request body must not exceed ${maxBytes} bytes`)
	const reader = request.body?.getReader()
	if (reader === undefined) throw invalid('A JSON body is required')
	const chunks: Uint8Array[] = []
	let total = 0
	for (; ;) {
		const result = await reader.read()
		if (result.done) break
		total += result.value.length
		if (total > maxBytes) {
			void reader.cancel().catch(() => undefined)
			throw new ApiError(413, 'payload_too_large', `The request body must not exceed ${maxBytes} bytes`)
		}
		chunks.push(result.value)
	}
	let parsed: unknown
	try {
		const decoder = new TextDecoder()
		let text = ''
		for (const chunk of chunks) text += decoder.decode(chunk, { stream: true })
		text += decoder.decode()
		parsed = JSON.parse(text)
	} catch { throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON') }
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid('The request body must be a JSON object')
	const entries: [string, unknown][] = Object.entries(parsed)
	return Object.fromEntries(entries)
}

export function requireString(body: Record<string, unknown>, key: string): string {
	const value = body[key]
	if (typeof value !== 'string') throw invalid(`"${key}" must be a string`)
	return value
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
	const value = body[key]
	if (value === undefined || value === null) return undefined
	if (typeof value !== 'string') throw invalid(`"${key}" must be a string`)
	return value
}

export function requireInteger(body: Record<string, unknown>, key: string): number {
	const value = body[key]
	if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(`"${key}" must be an integer`)
	return value
}

export function optionalInteger(body: Record<string, unknown>, key: string): number | undefined {
	const value = body[key]
	if (value === undefined || value === null) return undefined
	return requireInteger(body, key)
}
