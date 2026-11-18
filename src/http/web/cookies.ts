export function parseCookies(header: string | null): Map<string, string> {
	const cookies = new Map<string, string>()
	if (header === null) return cookies
	for (const part of header.split(';')) {
		const separator = part.indexOf('=')
		if (separator <= 0) continue
		const name = part.slice(0, separator).trim()
		if (!cookies.has(name)) cookies.set(name, part.slice(separator + 1).trim())
	}
	return cookies
}

/**
 * True when the browser reached the server over HTTPS, directly or through a
 * proxy that sets `X-Forwarded-Proto`.
 */
export function isSecureRequest(request: Request): boolean {
	return request.url.startsWith('https:') || request.headers.get('x-forwarded-proto') === 'https'
}

/**
 * Serialises a session cookie: HttpOnly so scripts cannot read it, SameSite
 * Strict so other sites cannot send it, and Secure over HTTPS.
 */
export function serializeSessionCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
	return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`
}
