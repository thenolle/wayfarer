/** @jsxImportSource @gambrel/view */
import { Button, Checkbox, EmptyState, Kbd, Toolbar, ToolbarGroup } from '@gambrel/components'
import { CirclePause, CircleX, Inbox, Play, Trash } from '@gambrel/icons'
import type { LoaderData, PageProps, ParamsOf } from '@gambrel/router'
import type { Child } from '@gambrel/view'
import { Flash } from '../../components/chrome'
import { DownloadItem } from '../../components/download-item'
import { AddForm, HiddenFields, QueueForm, SearchForm } from '../../components/forms'
import { AppSidebar } from '../../components/sidebar'
import { StatsRow } from '../../components/stats'
import type { loader } from './page.server'

export default function DashboardPage(props: PageProps<ParamsOf<'/'>, LoaderData<typeof loader>>): Child {
	const { data } = props
	return (
		<div class="workspace">
			<AppSidebar view={data.view} counts={data.counts} csrf={data.csrf} bytesPerSecond={data.bandwidthBytesPerSecond} />
			<section class="main">
				<Flash flash={data.flash} />
				<StatsRow stats={data.stats} bytesPerSecond={data.bandwidthBytesPerSecond} />
				<AddForm csrf={data.csrf} view={data.view} locations={data.locations} />
				<SearchForm view={data.view} />
				<QueueForm csrf={data.csrf} view={data.view} />
				<form id="bulk" method="post" action="/actions/bulk"><HiddenFields csrf={data.csrf} view={data.view} /></form>
				<Toolbar class="bulk-bar" role="toolbar" aria-label="Actions for selected downloads">
					<ToolbarGroup>
						<label class="select-all" data-js-only><Checkbox data-select-all aria-label="Select all downloads" /> Select all</label>
					</ToolbarGroup>
					<ToolbarGroup>
						<Button type="submit" form="bulk" name="action" value="pause" variant="outline" size="sm"><CirclePause size={14} /> Pause</Button>
						<Button type="submit" form="bulk" name="action" value="resume" variant="outline" size="sm"><Play size={14} /> Resume</Button>
						<Button type="submit" form="bulk" name="action" value="cancel" variant="outline" size="sm"><CircleX size={14} /> Cancel</Button>
						<Button type="submit" form="bulk" name="action" value="remove" variant="outline" size="sm"><Trash size={14} /> Remove</Button>
					</ToolbarGroup>
				</Toolbar>
				<ul class="downloads" id="downloads">
					{data.downloads.length === 0
						? (<li><EmptyState icon={<Inbox size={32} />} title={data.view.q === '' ? 'Nothing here yet' : 'No matches'} description={data.view.q === '' ? 'Paste a link above to start a download.' : 'Try a different search.'} /></li>)
						: (data.downloads.map((download) => (<DownloadItem key={download.id} download={download} csrf={data.csrf} view={data.view} canReveal={data.canReveal} />)))
					}
				</ul>
				<p class="muted shortcuts" data-js-only><Kbd>/</Kbd> search · <Kbd>N</Kbd> add links</p>
			</section>
		</div>
	)
}
