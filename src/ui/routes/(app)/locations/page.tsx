/** @jsxImportSource @gambrel/view */
import { Button, EmptyState, Input, Label } from '@gambrel/components'
import { Inbox, Plus, Trash } from '@gambrel/icons'
import type { LoaderData, PageProps, ParamsOf } from '@gambrel/router'
import type { Child } from '@gambrel/view'
import { Flash } from '../../../components/chrome'
import type { loader } from './page.server'

const BADGES = { default: 'Main folder', config: 'Set by configuration', user: '' } as const

export default function LocationsPage(props: PageProps<ParamsOf<'/locations'>, LoaderData<typeof loader>>): Child {
	const { data } = props
	return (
		<section class="main locations">
			<Flash flash={data.flash} />
			<div class="page-head">
				<h1>Save locations</h1>
				<p class="muted">Choose where finished files can be saved. Locations set in <code>WAYFARER_LOCATIONS</code> are fixed; the ones you add here can be changed at any time. <a href="/">Back to downloads</a></p>
			</div>
			<form class="location-add" method="post" action="/actions/locations/add">
				<input type="hidden" name="csrf" value={data.csrf} />
				<div class="location-fields">
					<div>
						<Label for="new-label">Name</Label>
						<Input id="new-label" name="label" type="text" required maxlength={40} autocomplete="off" placeholder="Games" />
					</div>
					<div>
						<Label for="new-path">Folder on this computer</Label>
						<Input id="new-path" name="path" type="text" required autocomplete="off" spellcheck={false} placeholder="/srv/games or D:\Games" />
					</div>
					<Button type="submit"><Plus size={16} /> Add location</Button>
				</div>
			</form>
			{data.locations.length === 0 ? (
				<EmptyState icon={<Inbox size={32} />} title="No locations" description="Add a folder above." />
			) : (
				<ul class="location-list">
					{data.locations.map((location) => (
						<li key={location.id} class="location-item">
							{location.managed === 'user' ? (
								<>
									<form method="post" action={`/actions/locations/${location.id}/update`}>
										<input type="hidden" name="csrf" value={data.csrf} />
										<div class="location-fields">
											<div>
												<Label for={`label-${location.id}`}>Name</Label>
												<Input id={`label-${location.id}`} name="label" type="text" required maxlength={40} value={location.label} />
											</div>
											<div>
												<Label for={`path-${location.id}`}>Folder</Label>
												<Input id={`path-${location.id}`} name="path" type="text" required spellcheck={false} value={location.path} readonly={location.downloads > 0} />
											</div>
											<Button type="submit" variant="secondary">Save</Button>
										</div>
									</form>
									<div class="location-actions">
										<span class="muted">{location.downloads === 0 ? 'No downloads here' : `${location.downloads} download${location.downloads === 1 ? '' : 's'} here: the folder is locked until they are removed`}</span>
										<form method="post" action={`/actions/locations/${location.id}/remove`}>
											<input type="hidden" name="csrf" value={data.csrf} />
											<Button type="submit" variant="outline" size="sm" disabled={location.downloads > 0}><Trash size={14} /> Remove</Button>
										</form>
									</div>
								</>
							) : (
								<div class="location-meta">
									<strong>{location.label}</strong>
									<span class="location-path">{location.path}</span>
									<span>{BADGES[location.managed]}</span>
									<span>{location.downloads} download{location.downloads === 1 ? '' : 's'}</span>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
