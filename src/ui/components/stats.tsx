/** @jsxImportSource @gambrel/view */
import { Progress, StatCard } from '@gambrel/components'
import type { Child } from '@gambrel/view'
import { formatBytes, formatPercent, formatSpeed, PROGRESS_SCALE } from '../format'
import type { StatsView } from '../view-model'

export function StatsRow(props: { stats: StatsView; bytesPerSecond: number }): Child {
	const { stats } = props
	return (
		<div id="stats" class="stats">
			<StatCard label="Speed" value={<span data-field="total-speed">{formatSpeed(stats.speedBytesPerSecond)}</span>} detail={props.bytesPerSecond > 0 ? `Limit ${formatBytes(props.bytesPerSecond)}/s` : 'No limit'} />
			<StatCard label="Active" value={<span data-field="active-count">{stats.active}</span>} detail="Transferring now" />
			<StatCard label="Queued" value={stats.queued} detail="Waiting for a slot" />
			<StatCard label="Completed" value={formatBytes(stats.completedBytes)} detail="Finished downloads" />
			<div class="overall" data-field="overall-wrap" hidden={stats.active === 0}>
				<span class="overall-label">All active downloads</span>
				<Progress data-field="overall" aria-label="Progress of all active downloads" max={PROGRESS_SCALE} value={Math.round((stats.activeProgress ?? 0) * PROGRESS_SCALE)} />
				<span class="percent" data-field="overall-percent">{formatPercent(stats.activeProgress)}</span>
			</div>
		</div>
	)
}
