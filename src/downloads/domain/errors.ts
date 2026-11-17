import type { DownloadStatus } from './status'

/**
 * Raised when a download is asked to move to a status its current status does
 * not allow.
 */
export class InvalidTransitionError extends Error {
	constructor(readonly from: DownloadStatus, readonly to: DownloadStatus) {
		super(`A download cannot move from "${from}" to "${to}"`)
		this.name = 'InvalidTransitionError'
	}
}

/**
 * Raised when a download id does not exist.
 */
export class DownloadNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`Download "${id}" was not found`)
		this.name = 'DownloadNotFoundError'
	}
}
