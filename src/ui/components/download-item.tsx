/** @jsxImportSource @gambrel/view */
import type { Child } from '@gambrel/view'
import { checksumLabel, formatBytes, formatEta, formatSpeed, PROGRESS_SCALE, retryLabel } from '../format'
import type { DownloadView, FilterName } from '../view-model'
import { StatusBadge } from './chrome'
import { ActionButton, PriorityForm } from './forms'

export function DownloadItem(props: { download: DownloadView; csrf: string; filter: FilterName }): Child {
	const { download: d, csrf, filter } = props
	const running = d.status === 'probing' || d.status === 'downloading' || d.status === 'verifying'
	const open = d.status !== 'completed' && d.status !== 'cancelled'
	const checksum = checksumLabel(d.checksum)
	const button = (action: string, label: string, tone: 'primary' | 'quiet' | 'danger'): Child => (<ActionButton id={d.id} action={action} label={label} csrf={csrf} filter={filter} tone={tone} />)

	return (
		<li class="download" id={`download-${d.id}`} data-download={d.id} data-status={d.status}>
			<div class="download-head">
				<div class="download-title">
					<h3 class="filename" title={d.filename}>{d.filename}</h3>
					<p class="source" title={d.url}>{d.url}</p>
				</div>
				<StatusBadge status={d.status} />
			</div>
			{open ? (<progress class="bar" data-field="progress" max={PROGRESS_SCALE} value={d.progress === null ? null : Math.round(d.progress * PROGRESS_SCALE)} />) : null}
			<dl class="metrics">
				<div>
					<dt>Downloaded</dt>
					<dd><span data-field="downloaded">{formatBytes(d.downloadedBytes)}</span>{' of '}<span data-field="total">{d.totalBytes === null ? 'unknown size' : formatBytes(d.totalBytes)}</span></dd>
				</div>
				<div>
					<dt>Speed</dt>
					<dd data-field="speed">{running ? formatSpeed(d.speedBytesPerSecond) : '—'}</dd>
				</div>
				<div>
					<dt>Time left</dt>
					<dd data-field="eta">{running ? formatEta(d.etaSeconds) : '—'}</dd>
				</div>
				<div>
					<dt>Priority</dt>
					<dd>{d.priority}</dd>
				</div>
			</dl>
			{d.segments.length > 1 ? (<div class="segments" role="group" aria-label="Segment progress">{d.segments.map((segment) => (<progress key={segment.index} class="segment" data-segment={segment.index} data-status={segment.status} max={Math.max(1, segment.totalBytes)} value={segment.downloadedBytes} />))}</div>) : null}
			<p class="note" data-field="retries" hidden={d.retryCount === 0}>{retryLabel(d.retryCount)}</p>
			{checksum === null ? null : (<p class={`note note-${d.checksum.state}`} data-checksum={d.checksum.state}>{checksum}</p>)}
			{d.error === null ? null : (<p class="note note-error" role="alert">{d.error.message}</p>)}
			<div class="actions">
				{d.status === 'completed' ? (<a class="btn btn-primary" href={`/files/${d.id}`}>Download file</a>) : null}
				{d.status === 'queued' || running ? button('pause', 'Pause', 'quiet') : null}
				{d.status === 'paused' ? button('resume', 'Resume', 'primary') : null}
				{d.status === 'failed' ? button('resume', 'Retry', 'primary') : null}
				{open && d.status !== 'failed' ? button('cancel', 'Cancel', 'danger') : null}
				{!running ? button('delete', 'Remove', 'quiet') : null}
				{d.status === 'completed' ? button('delete-file', 'Remove and delete file', 'danger') : null}
				{open ? <PriorityForm id={d.id} priority={d.priority} csrf={csrf} filter={filter} /> : null}
			</div>
		</li>
	)
}
