import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * The hidden folder where aria2 works on one torrent. It sits next to the
 * destination so the finished data can be renamed into place on any drive.
 */
export function stagingDirectory(destination: string, id: string): string {
	return join(dirname(destination), `.${id}.torrent-part`)
}

export async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

/**
 * Keeps `.torrent` files by info hash, so a torrent resumes with its trackers
 * and without asking the swarm for its metadata again.
 */
export class TorrentStore {
	constructor(private readonly directory: string) { }

	private pathFor(infoHash: string): string {
		return join(this.directory, 'files', `${infoHash}.torrent`)
	}

	async save(infoHash: string, bytes: Uint8Array): Promise<void> {
		await mkdir(join(this.directory, 'files'), { recursive: true })
		await Bun.write(this.pathFor(infoHash), bytes)
	}

	has(infoHash: string): Promise<boolean> {
		return Bun.file(this.pathFor(infoHash)).exists()
	}

	async load(infoHash: string): Promise<Uint8Array | null> {
		const file = Bun.file(this.pathFor(infoHash))
		if (!(await file.exists())) return null
		return new Uint8Array(await file.arrayBuffer())
	}
}
