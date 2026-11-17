import { link, rename, stat, unlink } from 'node:fs/promises'
import { DestinationExistsError, isErrnoException } from './errors'

const LINK_UNSUPPORTED = new Set(['EPERM', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EMLINK', 'EXDEV'])

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path)
		return true
	} catch (error) {
		if (isErrnoException(error) && error.code === 'ENOENT') return false
		throw error
	}
}

/**
 * Moves a completed part file to its final name without overwriting anything.
 *
 * The preferred method hard-links the part file to the destination, which
 * fails atomically if the destination exists, and then removes the part file.
 * Filesystems that cannot create hard links fall back to an existence check
 * followed by a rename, which leaves a short window in which another process
 * could create the destination.
 *
 * @throws {DestinationExistsError} when the destination already exists.
 */
export async function finalizePartFile(partPath: string, destination: string): Promise<void> {
	try {
		await link(partPath, destination)
	} catch (error) {
		if (!isErrnoException(error)) throw error
		if (error.code === 'EEXIST') throw new DestinationExistsError()
		if (!LINK_UNSUPPORTED.has(error.code ?? '')) throw error
		if (await pathExists(destination)) throw new DestinationExistsError()
		await rename(partPath, destination)
		return
	}
	await unlink(partPath)
}
