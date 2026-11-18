/** @jsxImportSource @gambrel/view */
import { StatCard } from '@gambrel/components'
import type { Child } from '@gambrel/view'
import { formatBytes, formatSpeed } from '../format'
import type { StatsView } from '../view-model'

export function StatsRow(props: { stats: StatsView; bytesPerSecond: number }): Child {
	const { stats } = props
	return (
		<div id="stats" class="stats">
			<StatCard label="Speed" value={<span data-field="total-speed">{formatSpeed(stats.speedBytesPerSecond)}</span>} detail={props.bytesPerSecond > 0 ? `Limit ${formatBytes(props.bytesPerSecond)}/s` : 'No limit'} />
			<StatCard label="Active" value={<span data-field="active-count">{stats.active}</span>} detail="Transferring now" />
			<StatCard label="Queued" value={stats.queued} detail="Waiting for a slot" />
			<StatCard label="Completed" value={formatBytes(stats.completedBytes)} detail="Finished downloads" />
		</div>
	)
}
