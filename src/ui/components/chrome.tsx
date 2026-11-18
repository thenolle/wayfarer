/** @jsxImportSource @gambrel/view */
import type { Child } from '@gambrel/view'
import type { DownloadStatus } from '../../downloads/domain/status'
import { statusLabel } from '../format'
import { FILTER_LABELS, FILTERS } from '../view-model'
import type { FilterName, FlashView } from '../view-model'

export function StatusBadge(props: { status: DownloadStatus }): Child {
	return (<span class="badge" data-field="status" data-status={props.status}>{statusLabel(props.status)}</span>)
}

export function Flash(props: { flash: FlashView | null }): Child {
	if (props.flash === null) return null
	return (<p class={`flash flash-${props.flash.kind}`} role={props.flash.kind === 'error' ? 'alert' : 'status'}>{props.flash.message}</p>)
}

export function FilterTabs(props: { filter: FilterName; counts: Record<FilterName, number> }): Child {
	return (<nav id="filters" class="filters" aria-label="Filter downloads">{FILTERS.map((name) => (<a key={name} class="filter" href={name === 'all' ? '/' : `/?filter=${name}`} aria-current={name === props.filter ? 'page' : null}>{FILTER_LABELS[name]} <span class="count">{props.counts[name]}</span></a>))}</nav>)
}
