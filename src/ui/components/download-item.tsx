/** @jsxImportSource @gambrel/view */
import { buttonVariants, Card, Checkbox, DescriptionList, Progress } from '@gambrel/components'
import { CircleX, Download, Ellipsis, Pause, Play, RefreshCw, Trash } from '@gambrel/icons'
import type { Child } from '@gambrel/view'
import { checksumLabel, formatBytes, formatEta, formatPercent, formatSpeed, PROGRESS_SCALE, retryLabel } from '../format'
import { isRunning } from '../view-model'
import type { DownloadView, ViewState } from '../view-model'
import { StatusBadge, StatusIcon } from './chrome'
import { ActionButton, PriorityForm } from './forms'

export function DownloadItem(props: { download: DownloadView; csrf: string; view: ViewState }): Child {
	const { download: d, csrf, view } = props
	const running = isRunning(d.status)
	const open = d.status !== 'completed' && d.status !== 'cancelled'
	const checksum = checksumLabel(d.checksum)
	const action = (name: string, label: string, icon: typeof Pause, variant: 'default' | 'outline' | 'destructive' | 'ghost') => (<ActionButton id={d.id} action={name} label={label} icon={icon} csrf={csrf} view={view} variant={variant} />)

	return (
		<li class="download" id={`download-${d.id}`} data-download={d.id} data-status={d.status} data-speed={running ? d.speedBytesPerSecond : 0}>
			<Card class="download-card">
				<div class="download-grid">
					<Checkbox name="id" value={d.id} form="bulk" aria-label={`Select ${d.filename}`} />
					<StatusIcon status={d.status} />
					<div class="download-body">
						<div class="download-head">
							<div class="download-title">
								<h3 class="filename" title={d.filename}>{d.filename}</h3>
								<p class="source" title={d.url}>{d.url}</p>
							</div>
							<StatusBadge status={d.status} />
						</div>
						{open ? (
							<div class="progress-row">
								<Progress data-field="progress" aria-label={`Progress of ${d.filename}`} max={PROGRESS_SCALE} value={Math.round((d.progress ?? 0) * PROGRESS_SCALE)} />
								<span class="percent" data-field="percent">{formatPercent(d.progress)}</span>
							</div>
						) : null}
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
						{d.segments.length > 1 ? (
							<div class="segments" role="group" aria-label="Segment progress">
								{d.segments.map((segment) => (
									<Progress key={segment.index} class="segment" data-segment={segment.index} data-status={segment.status} aria-label={`Segment ${segment.index + 1}`} max={Math.max(1, segment.totalBytes)} value={segment.downloadedBytes} />
								))}
							</div>
						) : null}
						<p class="note" data-field="retries" hidden={d.retryCount === 0}>{retryLabel(d.retryCount)}</p>
						{checksum === null ? null : (<p class={`note note-${d.checksum.state}`} data-checksum={d.checksum.state}>{checksum}</p>)}
						{d.error === null ? null : (<p class="note note-error" role="alert">{d.error.message}</p>)}
						<div class="actions">
							{d.status === 'completed' ? (<a class={buttonVariants({ size: 'sm' })} href={`/files/${d.id}`}><Download size={14} /> Download file</a>) : null}
							{d.status === 'queued' || running ? action('pause', 'Pause', Pause, 'outline') : null}
							{d.status === 'paused' ? action('resume', 'Resume', Play, 'default') : null}
							{d.status === 'failed' ? action('resume', 'Retry', RefreshCw, 'default') : null}
							{open && d.status !== 'failed' ? action('cancel', 'Cancel', CircleX, 'ghost') : null}
							<details class="more">
								<summary class={buttonVariants({ variant: 'ghost', size: 'sm' })}><Ellipsis size={16} /> More</summary>
								<div class="more-panel">
									{open ? <PriorityForm id={d.id} priority={d.priority} csrf={csrf} view={view} /> : null}
									{!running ? action('delete', 'Remove from list', Trash, 'outline') : null}
									{d.status === 'completed' ? action('delete-file', 'Remove and delete file', Trash, 'destructive') : null}
									<DescriptionList items={[{ term: 'Source', description: d.url }, { term: 'Retries', description: String(d.retryCount) }, { term: 'Segments', description: String(d.segments.length) }]} />
								</div>
							</details>
						</div>
					</div>
				</div>
			</Card>
		</li>
	)
}
