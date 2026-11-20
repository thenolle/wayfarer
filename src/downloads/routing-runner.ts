import type { DownloadsRepository } from '../database/downloads-repository'
import type { RunOutcome } from './engine/engine'
import type { DownloadRunner } from './scheduler/scheduler'

/**
 * Torrents are stored as magnet links; every other download is an http(s) link.
 */
export function isTorrentRecord(record: { readonly url: string }): boolean {
	return record.url.startsWith('magnet:')
}

/**
 * Sends each download to the runner that understands it. The scheduler keeps
 * one runner, so queueing, priorities, pause, resume and shutdown behave the
 * same for HTTP downloads and torrents.
 */
export class RoutingRunner implements DownloadRunner {
	constructor(
		private readonly downloads: Pick<DownloadsRepository, 'get'>,
		private readonly http: DownloadRunner,
		private readonly torrent: DownloadRunner
	) { }

	run(id: string, signal: AbortSignal): Promise<RunOutcome> {
		const record = this.downloads.get(id)
		return (record !== null && isTorrentRecord(record) ? this.torrent : this.http).run(id, signal)
	}
}
