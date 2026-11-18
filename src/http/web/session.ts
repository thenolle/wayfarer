export interface Flash {
	readonly kind: 'success' | 'error'
	readonly message: string
}

/**
 * A browser session, kept in server memory. `csrfToken` must accompany every
 * form that changes state. Sessions disappear when the server restarts, which
 * simply asks the user to sign in again.
 */
export interface Session {
	readonly id: string
	readonly csrfToken: string
	authenticated: boolean
	flash: Flash | null
	readonly expiresAt: number
}

export interface SessionStoreOptions {
	readonly ttlMs?: number
	readonly maxSessions?: number
	readonly clock?: () => number
}

function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Returns the pending message for the next page and clears it.
 */
export function takeFlash(session: Session): Flash | null {
	const flash = session.flash
	session.flash = null
	return flash
}

/**
 * In-memory session storage with a fixed lifetime (12 hours by default) and a
 * size cap (1000 sessions). When the cap is reached the oldest session is
 * dropped, so memory use stays bounded.
 */
export class SessionStore {
	private readonly sessions = new Map<string, Session>()
	private readonly ttlMs: number
	private readonly maxSessions: number
	private readonly clock: () => number

	constructor(options: SessionStoreOptions = {}) {
		this.ttlMs = options.ttlMs ?? 12 * 60 * 60 * 1000
		this.maxSessions = options.maxSessions ?? 1000
		this.clock = options.clock ?? Date.now
	}

	get ttlSeconds(): number {
		return Math.floor(this.ttlMs / 1000)
	}

	get size(): number {
		return this.sessions.size
	}

	create(authenticated: boolean): Session {
		this.purgeExpired()
		while (this.sessions.size >= this.maxSessions) {
			const oldest = this.sessions.keys().next()
			if (oldest.done) break
			this.sessions.delete(oldest.value)
		}
		const session: Session = {
			id: randomToken(),
			csrfToken: randomToken(),
			authenticated,
			flash: null,
			expiresAt: this.clock() + this.ttlMs
		}
		this.sessions.set(session.id, session)
		return session
	}

	get(id: string | undefined): Session | null {
		if (id === undefined) return null
		const session = this.sessions.get(id)
		if (session === undefined) return null
		if (session.expiresAt <= this.clock()) {
			this.sessions.delete(id)
			return null
		}
		return session
	}

	destroy(id: string): void {
		this.sessions.delete(id)
	}

	private purgeExpired(): void {
		const now = this.clock()
		for (const [id, session] of this.sessions) {
			if (session.expiresAt <= now) this.sessions.delete(id)
		}
	}
}

/**
 * Slows down guessing of the access token: after `maxFailures` wrong attempts
 * within `windowMs`, further attempts are refused until the window passes.
 */
export class LoginThrottle {
	private failures: number[] = []

	constructor(private readonly maxFailures: number = 5, private readonly windowMs: number = 60_000, private readonly clock: () => number = Date.now) { }

	get blocked(): boolean {
		this.prune()
		return this.failures.length >= this.maxFailures
	}

	recordFailure(): void {
		this.prune()
		this.failures.push(this.clock())
	}

	reset(): void {
		this.failures = []
	}

	private prune(): void {
		const cutoff = this.clock() - this.windowMs
		this.failures = this.failures.filter((time) => time > cutoff)
	}
}
