/** @jsxImportSource @gambrel/view */
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarLink } from '@gambrel/components'
import { Activity, CircleCheck, CirclePause, Clock, List, TriangleAlert } from '@gambrel/icons'
import type { IconComponent } from '@gambrel/icons'
import type { Child } from '@gambrel/view'
import { BandwidthForm } from './forms'
import { FILTER_LABELS, FILTERS, viewHref } from '../view-model'
import type { FilterName, ViewState } from '../view-model'

const ICONS: Readonly<Record<FilterName, IconComponent>> = {
	all: List,
	active: Activity,
	queued: Clock,
	paused: CirclePause,
	completed: CircleCheck,
	failed: TriangleAlert
}

export function AppSidebar(props: { view: ViewState, counts: Record<FilterName, number>, csrf: string, bytesPerSecond: number }): Child {
	return (
		<Sidebar id="sidebar" class="app-sidebar" aria-label="Downloads">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Downloads</SidebarGroupLabel>
					{FILTERS.map((name) => {
						const Icon = ICONS[name]
						return (
							<SidebarLink key={name} class="side-link" href={viewHref(props.view, { filter: name })} aria-current={name === props.view.filter ? 'page' : null}>
								<Icon size={16} />
								<span class="side-label">{FILTER_LABELS[name]}</span>
								<span class="count">{props.counts[name]}</span>
							</SidebarLink>
						)
					})}
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<BandwidthForm csrf={props.csrf} view={props.view} bytesPerSecond={props.bytesPerSecond} />
			</SidebarFooter>
		</Sidebar>
	)
}
