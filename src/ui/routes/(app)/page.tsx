/** @jsxImportSource @gambrel/view */
import type { LoaderData, PageProps, ParamsOf } from '@gambrel/router'
import type { Child } from '@gambrel/view'
import { FilterTabs, Flash } from '../../components/chrome'
import { DownloadItem } from '../../components/download-item'
import { AddForm, BandwidthForm } from '../../components/forms'
import type { loader } from './page.server'

export default function DashboardPage(props: PageProps<ParamsOf<'/'>, LoaderData<typeof loader>>): Child {
	const { data } = props
	return (
		<>
			<Flash flash={data.flash} />
			<AddForm csrf={data.csrf} filter={data.filter} />
			<FilterTabs filter={data.filter} counts={data.counts} />
			<ul class="downloads" id="downloads">
				{data.downloads.length === 0 ? (
					<li class="empty">
						<p>Nothing here yet.</p>
						<p class="muted">Paste a link above to start a download.</p>
					</li>
				) : (data.downloads.map((download) => (<DownloadItem key={download.id} download={download} csrf={data.csrf} filter={data.filter} />)))}
			</ul>
			<BandwidthForm csrf={data.csrf} filter={data.filter} bytesPerSecond={data.bandwidthBytesPerSecond} />
		</>
	)
}
