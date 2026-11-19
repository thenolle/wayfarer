/** @jsxImportSource @gambrel/view */
import { Button, Input, Label, Textarea } from '@gambrel/components'
import { ChevronDown, Plus, Search, Gauge } from '@gambrel/icons'
import type { IconComponent } from '@gambrel/icons'
import type { Child } from '@gambrel/view'
import { formatBytes } from '../format'
import { SORT_LABELS, SORTS } from '../view-model'
import type { ViewState } from '../view-model'

type Tone = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost'

const PRESETS: readonly { label: string; bytes: number }[] = [
	{ label: 'No limit', bytes: 0 },
	{ label: '1 MiB/s', bytes: 1024 * 1024 },
	{ label: '5 MiB/s', bytes: 5 * 1024 * 1024 },
	{ label: '10 MiB/s', bytes: 10 * 1024 * 1024 }
]

export function HiddenFields(props: { csrf: string; view: ViewState }): Child {
	return (
		<>
			<input type="hidden" name="csrf" value={props.csrf} />
			<input type="hidden" name="filter" value={props.view.filter} />
			<input type="hidden" name="q" value={props.view.q} />
			<input type="hidden" name="sort" value={props.view.sort} />
		</>
	)
}

export function AddForm(props: { csrf: string; view: ViewState; locations: readonly { id: string; label: string }[] }): Child {
	return (
		<form class="add-form" method="post" action="/actions/add">
			<HiddenFields csrf={props.csrf} view={props.view} />
			<Label for="add-url">Add downloads</Label>
			<Textarea id="add-url" name="url" rows={2} required autocomplete="off" spellcheck={false} placeholder="Paste one or more links, one per line" />
			<div id="add-preview" class="preview" role="status" aria-live="polite" hidden></div>
			<div class="add-row">
				<div class="add-field">
					<Label for="add-filename">File name</Label>
					<Input id="add-filename" name="filename" type="text" autocomplete="off" placeholder="Detected automatically" />
				</div>
				<div class="add-field">
					<Label for="add-location">Save to</Label>
					<div class="gb-select-wrap">
						<select id="add-location" name="location" class="gb-select">
							{props.locations.map((location) => (<option key={location.id} value={location.id}>{location.label}</option>))}
						</select>
						<ChevronDown class="gb-select-icon" size={16} />
					</div>
					<a class="muted" href="/locations">Manage locations</a>
				</div>
				<div class="add-field">
					<Label for="add-subfolder">Subfolder</Label>
					<Input id="add-subfolder" name="subfolder" type="text" autocomplete="off" placeholder="Optional, e.g. Games/PC" />
				</div>
			</div>
			<div class="add-actions">
				<details class="add-options">
					<summary>More options</summary>
					<div class="options-grid">
						<Label for="add-priority">Priority (-100 to 100)</Label>
						<Input id="add-priority" name="priority" type="number" min="-100" max="100" step="1" value="0" />
						<Label for="add-sha256">SHA-256 checksum</Label>
						<Input id="add-sha256" name="sha256" type="text" placeholder="Single link only" autocomplete="off" />
					</div>
				</details>
				<div class="add-buttons">
					<Button type="button" variant="outline" data-preview data-js-only><Search size={16} /> Check link</Button>
					<Button type="submit"><Plus size={16} /> Add</Button>
				</div>
			</div>
		</form>
	)
}

export function SearchForm(props: { view: ViewState }): Child {
	return (
		<form class="search-form" method="get" action="/">
			<input type="hidden" name="filter" value={props.view.filter} />
			<Label class="sr-only" for="search-q">Search downloads</Label>
			<Input id="search-q" name="q" type="search" placeholder="Search name or link" value={props.view.q} autocomplete="off" />
			<Label class="sr-only" for="sort">Sort by</Label>
			<div class="gb-select-wrap sort-select">
				<select id="sort" name="sort" class="gb-select">
					{SORTS.map((name) => (
						<option key={name} value={name} selected={name === props.view.sort}>
							{SORT_LABELS[name]}
						</option>
					))}
				</select>
				<ChevronDown class="gb-select-icon" size={16} />
			</div>
			<Button type="submit" variant="secondary"><Search size={16} /> Apply</Button>
		</form>
	)
}

export function BandwidthForm(props: { csrf: string; view: ViewState; bytesPerSecond: number }): Child {
	const limited = props.bytesPerSecond > 0
	return (
		<details class="bandwidth" open>
			<summary class="bandwidth-title">
				<Gauge size={16} />
				<span>Speed limit</span>
				<span class="bandwidth-state">{limited ? `${formatBytes(props.bytesPerSecond)}/s` : 'No limit'}</span>
			</summary>
			<div class="bandwidth-body">
				<p class="muted">{limited ? `Limited to ${formatBytes(props.bytesPerSecond)}/s across all downloads.` : 'No limit.'}</p>
				<form method="post" action="/actions/bandwidth" class="preset-form">
					<HiddenFields csrf={props.csrf} view={props.view} />
					{PRESETS.map((preset) => (
						<Button key={preset.bytes} type="submit" size="sm" variant={preset.bytes === props.bytesPerSecond ? 'default' : 'outline'} name="preset" value={String(preset.bytes)}>
							{preset.label}
						</Button>
					))}
				</form>
				<form method="post" action="/actions/bandwidth" class="custom-form">
					<HiddenFields csrf={props.csrf} view={props.view} />
					<Label class="sr-only" for="bandwidth-amount">Custom speed</Label>
					<Input id="bandwidth-amount" name="amount" type="number" min="0" step="any" placeholder="Custom" />
					<Label class="sr-only" for="bandwidth-unit">Unit</Label>
					<div class="gb-select-wrap">
						<select id="bandwidth-unit" name="unit" class="gb-select">
							<option value="kib">KiB/s</option>
							<option value="mib" selected>MiB/s</option>
						</select>
						<ChevronDown class="gb-select-icon" size={16} />
					</div>
					<Button type="submit" variant="secondary" size="sm">Set</Button>
				</form>
			</div>
		</details>
	)
}

export function ActionButton(props: { id: string, action: string, label: string, icon: IconComponent, csrf: string, view: ViewState, variant?: Tone }): Child {
	const Icon = props.icon
	return (
		<form class="inline" method="post" action={`/actions/downloads/${props.id}/${props.action}`}>
			<HiddenFields csrf={props.csrf} view={props.view} />
			<Button type="submit" size="sm" variant={props.variant ?? 'outline'}><Icon size={14} /> {props.label}</Button>
		</form>
	)
}

export function PriorityForm(props: { id: string; priority: number; csrf: string; view: ViewState }): Child {
	return (
		<form class="inline priority" method="post" action={`/actions/downloads/${props.id}/priority`}>
			<HiddenFields csrf={props.csrf} view={props.view} />
			<Label class="sr-only" for={`priority-${props.id}`}>Priority</Label>
			<Input id={`priority-${props.id}`} name="priority" type="number" min="-100" max="100" step="1" value={String(props.priority)} />
			<Button type="submit" size="sm" variant="secondary">Set priority</Button>
		</form>
	)
}
