import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'

export interface PartFileOptions {
	/** Preallocate the file to this many bytes. Null leaves the size alone. */
	readonly size: number | null
	/** Discard any existing content. When false the file must already exist. */
	readonly reset: boolean
}

/**
 * The `.part` file a download writes into. Supports positional writes so
 * several segments can fill disjoint ranges of one file concurrently.
 */
export class PartFile {
	private constructor(private readonly handle: FileHandle) { }

	/**
	 * @throws {Error} when `reset` is false and the file does not exist.
	 */
	static async open(path: string, options: PartFileOptions): Promise<PartFile> {
		const handle = await open(path, options.reset ? 'w' : 'r+')
		try {
			if (options.size !== null) await handle.truncate(options.size)
		} catch (error) {
			await handle.close()
			throw error
		}
		return new PartFile(handle)
	}

	/**
	 * Writes all of `data` at `position`, handling short writes.
	 */
	async writeAt(data: Uint8Array, position: number): Promise<void> {
		let written = 0
		while (written < data.length) {
			const result = await this.handle.write(data, written, data.length - written, position + written)
			if (result.bytesWritten === 0) throw new Error('The part file stopped accepting data')
			written += result.bytesWritten
		}
	}

	/**
	 * Flushes written data to stable storage.
	 */
	sync(): Promise<void> {
		return this.handle.sync()
	}

	truncate(size: number): Promise<void> {
		return this.handle.truncate(size)
	}

	close(): Promise<void> {
		return this.handle.close()
	}
}
