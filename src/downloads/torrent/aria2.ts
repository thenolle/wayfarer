import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Subprocess } from 'bun'

const START_TIMEOUT_MS = 15_000
const CALL_TIMEOUT_MS = 10_000
const STOP_TIMEOUT_MS = 5_000

/**
 * Raised when the aria2 process cannot be started or does not answer.
 * The message is safe to show to users.
 */
export class Aria2Error extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'Aria2Error'
	}
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null
}

export function asText(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null
}

export function asNumber(value: unknown): number {
	const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : 0
	return Number.isFinite(number) ? number : 0
}

export interface Aria2DaemonOptions {
	readonly binary: string
	readonly directory: string
	readonly maxPeers: number
	readonly trackers: readonly string[]
	readonly listenPort: string | null
	readonly maxConcurrentDownloads: number
	readonly downloadLimitBytesPerSecond: number
}

function reservePort(): number {
	const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null, { status: 204 }) })
	const port = server.port
	void server.stop(true)
	if (port === undefined) throw new Aria2Error('No free local port was found for the torrent engine')
	return port
}

/**
 * Owns one aria2 process and talks to it over JSON-RPC on a random loopback
 * port protected by a random secret. The process starts on first use, stops
 * when Wayfarer stops, and is restarted if it dies.
 */
export class Aria2Daemon {
	private child: Subprocess<'ignore', 'ignore', 'ignore'> | null = null
	private endpoint = ''
	private secret = ''
	private starting: Promise<void> | null = null
	private downloadLimit: number

	constructor(private readonly options: Aria2DaemonOptions) {
		this.downloadLimit = options.downloadLimitBytesPerSecond
	}

	private alive(): boolean {
		return this.child !== null && this.child.exitCode === null
	}

	/**
	 * Starts aria2 if it is not running.
	 *
	 * @throws {Aria2Error} when aria2 is missing or does not become ready.
	 */
	async ensureRunning(): Promise<void> {
		if (this.alive()) return
		this.starting ??= this.start().finally(() => { this.starting = null })
		await this.starting
	}

	/**
	 * Calls an aria2 RPC method without the `aria2.` prefix.
	 *
	 * @throws {Aria2Error} when the engine fails or refuses the call.
	 */
	async call(method: string, params: readonly unknown[] = []): Promise<unknown> {
		let response: Response
		try {
			response = await fetch(this.endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 'wayfarer', method: `aria2.${method}`, params: [`token:${this.secret}`, ...params] }),
				signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
			})
		} catch {
			throw new Aria2Error('The torrent engine is not responding')
		}
		let payload: unknown
		try {
			payload = await response.json()
		} catch {
			throw new Aria2Error('The torrent engine sent an unreadable answer')
		}
		const data = asRecord(payload)
		if (data === null) throw new Aria2Error('The torrent engine sent an unexpected answer')
		const failure = asRecord(data['error'])
		if (failure !== null) throw new Aria2Error(asText(failure['message']) ?? 'The torrent engine refused the request')
		return data['result']
	}

	/**
	 * Sets the overall download limit in bytes per second (0 for unlimited).
	 * Never rejects; the value is applied on the next start if aria2 is down.
	 */
	async setDownloadLimit(bytesPerSecond: number): Promise<void> {
		this.downloadLimit = bytesPerSecond
		if (!this.alive()) return
		try {
			await this.call('changeGlobalOption', [{ 'max-overall-download-limit': String(bytesPerSecond) }])
		} catch {
			return
		}
	}

	/**
	 * Asks aria2 to save its state and exit, and kills it if it takes too long.
	 */
	async stop(): Promise<void> {
		const child = this.child
		if (child === null || child.exitCode !== null) {
			this.child = null
			return
		}
		try {
			await this.call('shutdown')
		} catch {
			child.kill()
		}
		await Promise.race([child.exited, Bun.sleep(STOP_TIMEOUT_MS)])
		if (child.exitCode === null) child.kill()
		this.child = null
	}

	private launchArguments(port: number, secret: string): string[] {
		const { directory, maxPeers, trackers, listenPort, maxConcurrentDownloads } = this.options
		const args = [
			'--no-conf=true',
			'--enable-rpc=true',
			`--rpc-listen-port=${port}`,
			'--rpc-listen-all=false',
			`--rpc-secret=${secret}`,
			'--rpc-save-upload-metadata=false',
			`--stop-with-process=${process.pid}`,
			`--max-concurrent-downloads=${Math.max(8, maxConcurrentDownloads * 2)}`,
			'--seed-time=0',
			'--bt-save-metadata=true',
			'--bt-hash-check-seed=false',
			'--check-integrity=true',
			'--enable-dht=true',
			'--enable-peer-exchange=true',
			'--bt-enable-lpd=true',
			`--bt-max-peers=${maxPeers}`,
			'--file-allocation=falloc',
			'--auto-file-renaming=false',
			'--allow-overwrite=true',
			'--auto-save-interval=10',
			`--dht-file-path=${join(directory, 'dht.dat')}`,
			`--log=${join(directory, 'aria2.log')}`,
			'--log-level=warn',
			'--console-log-level=error',
			'--summary-interval=0'
		]
		if (this.downloadLimit > 0) args.push(`--max-overall-download-limit=${this.downloadLimit}`)
		if (trackers.length > 0) args.push(`--bt-tracker=${trackers.join(',')}`)
		if (listenPort !== null) args.push(`--listen-port=${listenPort}`, `--dht-listen-port=${listenPort}`)
		return args
	}

	private async start(): Promise<void> {
		await mkdir(this.options.directory, { recursive: true })
		const port = reservePort()
		const secret = crypto.randomUUID().replaceAll('-', '')
		let child: Subprocess<'ignore', 'ignore', 'ignore'>
		try {
			child = Bun.spawn([this.options.binary, ...this.launchArguments(port, secret)], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' })
		} catch {
			throw new Aria2Error(`aria2c could not be started. Install aria2 or set WAYFARER_ARIA2_PATH (tried "${this.options.binary}")`)
		}
		this.child = child
		this.endpoint = `http://127.0.0.1:${port}/jsonrpc`
		this.secret = secret
		const deadline = Date.now() + START_TIMEOUT_MS
		while (Date.now() < deadline) {
			if (child.exitCode !== null) {
				this.child = null
				throw new Aria2Error('aria2c stopped right after it started. See torrents/aria2.log in the data directory')
			}
			try {
				await this.call('getVersion')
				return
			} catch {
				await Bun.sleep(150)
			}
		}
		child.kill()
		this.child = null
		throw new Aria2Error('aria2c did not become ready in time')
	}
}
