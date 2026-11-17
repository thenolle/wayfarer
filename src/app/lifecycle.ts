export interface ShutdownOptions {
	/** Force exit if graceful shutdown takes longer than this. Default 30 seconds. */
	readonly timeoutMs?: number
	readonly exit?: (code: number) => void
	readonly log?: (message: string) => void
}

/**
 * Shuts the runtime down on `SIGINT` and `SIGTERM`, exiting with code 0 when it
 * finishes cleanly and 1 when it fails or exceeds the timeout. Further signals
 * while shutting down are ignored.
 *
 * Windows does not deliver `SIGTERM`; `SIGINT` (Ctrl+C) and `SIGBREAK` (Ctrl+Break
 * and console close) are handled instead.
 */
export function installShutdownHandlers(runtime: { shutdown(): Promise<void> }, options: ShutdownOptions = {}): void {
	const timeoutMs = options.timeoutMs ?? 30_000
	const exit = options.exit ?? ((code: number) => process.exit(code))
	const log = options.log ?? ((message: string) => console.log(`[wayfarer] ${message}`))
	let stopping = false
	const handler = (signal: NodeJS.Signals): void => {
		if (stopping) return
		stopping = true
		log(`received ${signal}, shutting down`)
		const timer = setTimeout(() => {
			log(`shutdown did not finish within ${timeoutMs} ms, exiting`)
			exit(1)
		}, timeoutMs)
		runtime.shutdown().then(() => {
			clearTimeout(timer)
			log('shutdown complete')
			exit(0)
		}, (error: unknown) => {
			clearTimeout(timer)
			console.error('[wayfarer] shutdown failed', error)
			exit(1)
		})
	}
	const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
	if (process.platform === 'win32') signals.push('SIGBREAK')
	for (const signal of signals) process.on(signal, handler)
}
