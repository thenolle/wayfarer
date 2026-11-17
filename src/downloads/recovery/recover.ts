import { rm } from 'node:fs/promises'
import type { DownloadsRepository } from '../../database/downloads-repository'
import type { SegmentsRepository } from '../../database/segments-repository'
import { partPathFor } from '../../filesystem/paths'
import { fileSize } from '../../filesystem/stat'
import { ACTIVE_STATUSES } from '../domain/status'
import { planRecovery } from './plan'
import type { RestartReason } from './plan'

export interface RecoveryReport {
	readonly resumed: readonly string[]
	readonly toVerify: readonly string[]
	readonly restarted: readonly { readonly id: string; readonly reason: RestartReason }[]
}

/**
 * Requeues every download that was left probing, downloading or verifying by
 * a previous run.
 *
 * Restarts remove the part file and segments before the status changes, so a
 * crash at any point leaves a state that this function handles again.
 * Running it repeatedly yields the same result and never marks an incomplete
 * download as completed.
 */
export async function recoverInterruptedDownloads(downloads: DownloadsRepository, segments: SegmentsRepository): Promise<RecoveryReport> {
	const resumed: string[] = []
	const toVerify: string[] = []
	const restarted: { id: string; reason: RestartReason }[] = []
	for (const download of downloads.listByStatuses(ACTIVE_STATUSES)) {
		const partPath = partPathFor(download.destination)
		const plan = planRecovery({ download, segments: segments.list(download.id), partFileSize: await fileSize(partPath) })
		if (plan.action === 'restart') {
			await rm(partPath, { force: true })
			segments.deleteFor(download.id)
			downloads.setStatus(download.id, 'queued', { downloadedBytes: 0, speedBytesPerSecond: 0, etaSeconds: null, errorCode: null, errorMessage: null })
			restarted.push({ id: download.id, reason: plan.reason })
			continue
		}
		downloads.setStatus(download.id, 'queued', { downloadedBytes: plan.downloadedBytes, speedBytesPerSecond: 0, etaSeconds: null })
		if (plan.action === 'verify') toVerify.push(download.id)
		else resumed.push(download.id)
	}
	return { resumed, toVerify, restarted }
}
