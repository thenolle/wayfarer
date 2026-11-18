import { LIVE_PROTOCOL_VERSION } from '../shared/live-protocol'
import type { DownloadLive, LiveMessage } from '../shared/live-protocol'

/**
 * The part of a WebSocket the hub needs. `send` returns 0 when the message was
 * dropped, -1 when it was queued under backpressure, and the byte count when
 * it was sent.
 */
export interface LiveClient {
	send(message: string): number
	close(code?: number, reason?: string): void
}

export interface HubOptions {
	readonly intervalMs?: number
	readonly maxClients?: number
}

interface Entry {
	readonly json: string
	readonly value: DownloadLive
}

/**
 * Pushes download changes to connected dashboards.
 *
 * While at least one client is connected, the hub reads the current state every
 * `intervalMs` (500 ms by default) and sends only what changed since the
 * previous read: updated downloads and the ids of removed ones. A new client
 * first receives one full snapshot. With no clients the hub does no work. A
 * client that cannot keep up (its message is dropped) is disconnected.
 */
export class LiveHub {
	private readonly clients = new Set<LiveClient>()
	private previous = new Map<string, Entry>()
	private timer: ReturnType<typeof setInterval> | undefined

	constructor(private readonly readSnapshot: () => readonly DownloadLive[], private readonly options: HubOptions = {}) { }

	get size(): number {
		return this.clients.size
	}

	get full(): boolean {
		return this.clients.size >= (this.options.maxClients ?? 32)
	}

	add(client: LiveClient): void {
		if (this.full) {
			client.close(1013, 'Too many connections')
			return
		}
		const current = this.read()
		if (this.clients.size === 0) this.previous = current
		this.clients.add(client)
		this.deliver(client, { type: 'snapshot', version: LIVE_PROTOCOL_VERSION, downloads: [...current.values()].map((entry) => entry.value) })
		this.start()
	}

	remove(client: LiveClient): void {
		this.clients.delete(client)
		if (this.clients.size === 0) this.stopTimer()
	}

	/**
	 * Compares the current state with the previous one and broadcasts the
	 * difference. Called by the timer; exposed so it can be driven directly.
	 */
	tick(): void {
		const current = this.read()
		const changed: DownloadLive[] = []
		for (const [id, entry] of current) {
			if (this.previous.get(id)?.json !== entry.json) changed.push(entry.value)
		}
		const removed = [...this.previous.keys()].filter((id) => !current.has(id))
		this.previous = current
		if (changed.length === 0 && removed.length === 0) return
		const message: LiveMessage = { type: 'update', version: LIVE_PROTOCOL_VERSION, downloads: changed, removed }
		for (const client of [...this.clients]) this.deliver(client, message)
	}

	/**
	 * Disconnects every client and stops polling. Used during shutdown.
	 */
	stop(): void {
		this.stopTimer()
		for (const client of this.clients) client.close(1001, 'Server shutting down')
		this.clients.clear()
	}

	private read(): Map<string, Entry> {
		const entries = new Map<string, Entry>()
		for (const value of this.readSnapshot()) entries.set(value.id, { json: JSON.stringify(value), value })
		return entries
	}

	private deliver(client: LiveClient, message: LiveMessage): void {
		if (client.send(JSON.stringify(message)) === 0) {
			this.clients.delete(client)
			client.close(1011, 'Client too slow')
		}
	}

	private start(): void {
		if (this.timer !== undefined) return
		this.timer = setInterval(() => { try { this.tick() } catch (error) { console.error('[wayfarer] live update failed', error) } }, this.options.intervalMs ?? 500)
	}

	private stopTimer(): void {
		if (this.timer !== undefined) clearInterval(this.timer)
		this.timer = undefined
	}
}
