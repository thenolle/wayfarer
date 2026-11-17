import type { Database } from 'bun:sqlite'

const BANDWIDTH_LIMIT_KEY = 'bandwidth_limit_bytes_per_second'

/**
 * Persistence for runtime settings that survive restarts.
 */
export class SettingsRepository {
	constructor(private readonly database: Database) { }

	get(key: string): string | null {
		const row = this.database.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key)
		return row === null ? null : row.value
	}

	set(key: string, value: string): void {
		this.database.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [key, value])
	}

	/**
	 * The stored global bandwidth limit in bytes per second, or null when none
	 * has been saved. `0` means unlimited.
	 */
	getBandwidthLimit(): number | null {
		const raw = this.get(BANDWIDTH_LIMIT_KEY)
		if (raw === null) return null
		const value = Number(raw)
		return Number.isSafeInteger(value) && value >= 0 ? value : null
	}

	setBandwidthLimit(bytesPerSecond: number): void {
		if (!Number.isSafeInteger(bytesPerSecond) || bytesPerSecond < 0) throw new RangeError('The bandwidth limit must be a non-negative integer')
		this.set(BANDWIDTH_LIMIT_KEY, String(bytesPerSecond))
	}
}
